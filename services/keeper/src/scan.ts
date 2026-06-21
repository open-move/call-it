import type { Config } from "./config.ts"
import type { StoredRawEvent } from "./db/database.ts"
import type { Repository } from "./db/repo.ts"
import { isPredictEventType } from "./predict.ts"
import type { SuiClient } from "./sui.ts"
import { protobufValueToJson } from "./sui.ts"
import { z } from "zod"

const safeNumberSchema = z
  .bigint()
  .refine((value) => value <= BigInt(Number.MAX_SAFE_INTEGER), "value exceeds Number.MAX_SAFE_INTEGER")
  .transform((value) => Number(value))

// The `Checkpoint` proto returned by `getCheckpoint` and pushed on the
// `subscribeCheckpoints` stream. Derived from the SDK response type so the
// backfill (getCheckpoint) and live-tail paths share one decode helper without
// importing a deep proto module path.
type GetCheckpointResponse = Awaited<ReturnType<SuiClient["ledgerService"]["getCheckpoint"]>["response"]>
export type CheckpointData = NonNullable<GetCheckpointResponse["checkpoint"]>

// readMask paths shared by the bounded scan, the backfill (`getCheckpoint`) and
// the live tail (`subscribeCheckpoints`) so every path decodes identically.
export const CHECKPOINT_READ_MASK_PATHS = ["sequence_number", "transactions.digest", "transactions.events"] as const

export interface ScanResult {
  fromCheckpoint: bigint | null
  insertedEvents: number
  latestCheckpoint: bigint
  scannedCheckpoints: number
  toCheckpoint: bigint | null
}

/// Seed the scan cursor on a fresh DB. Explicit by design: either pin a
/// historical KEEPER_START_CHECKPOINT (to backfill existing positions) or set
/// KEEPER_START_FROM_LATEST=true to watch forward from now. Starting silently
/// from latest would skip every pre-existing redeemable — so with neither set
/// this throws (fail fast) rather than guessing. Returns the seeded checkpoint,
/// or null if the cursor already existed.
export async function seedStartCheckpointIfFresh(
  config: Config,
  client: SuiClient,
  repo: Repository
): Promise<bigint | null> {
  const lastScanned = await repo.getLastScannedCheckpoint()
  if (lastScanned !== null) {
    return null
  }

  let start: bigint
  if (config.startCheckpoint !== null) {
    start = config.startCheckpoint
  } else if (config.startFromLatest) {
    const serviceInfo = await client.ledgerService.getServiceInfo({}).response
    start = serviceInfo.checkpointHeight ?? 0n
  } else {
    throw new Error(
      "a start checkpoint is required for a new keeper DB: set KEEPER_START_CHECKPOINT=<checkpoint> to backfill, or KEEPER_START_FROM_LATEST=true to watch forward from now"
    )
  }

  await repo.setLastScannedCheckpoint(start)
  return start
}

export async function scanPredictEvents(
  config: Config,
  client: SuiClient,
  repo: Repository
): Promise<ScanResult> {
  const serviceInfo = await client.ledgerService.getServiceInfo({}).response
  const latestCheckpoint = serviceInfo.checkpointHeight ?? 0n

  if ((await repo.getLastScannedCheckpoint()) === null) {
    await seedStartCheckpointIfFresh(config, client, repo)
    return {
      fromCheckpoint: null,
      insertedEvents: 0,
      latestCheckpoint,
      scannedCheckpoints: 0,
      toCheckpoint: null,
    }
  }

  const lastScanned = await repo.getLastScannedCheckpoint()
  if (lastScanned === null) {
    throw new Error("scan cursor missing after seeding")
  }

  const fromCheckpoint = lastScanned + 1n
  if (fromCheckpoint > latestCheckpoint) {
    return {
      fromCheckpoint: null,
      insertedEvents: 0,
      latestCheckpoint,
      scannedCheckpoints: 0,
      toCheckpoint: null,
    }
  }

  const toCheckpoint = minBigint(latestCheckpoint, lastScanned + BigInt(config.maxCheckpointsPerScan))
  let insertedEvents = 0
  let checkpoint = fromCheckpoint

  while (checkpoint <= toCheckpoint) {
    const events = await readPredictEventsAtCheckpoint(config, client, checkpoint)
    insertedEvents += await repo.insertRawEvents(events)
    await repo.setLastScannedCheckpoint(checkpoint)
    checkpoint += 1n
  }

  return {
    fromCheckpoint,
    insertedEvents,
    latestCheckpoint,
    scannedCheckpoints: safeNumberSchema.parse(toCheckpoint - fromCheckpoint + 1n),
    toCheckpoint,
  }
}

// Map a checkpoint proto -> the Predict events we persist, in
// (txIndex, eventIndex) order, filtered to the configured Predict package.
// Shared by the bounded scan / backfill (`getCheckpoint`) and the live tail
// (the pushed `res.checkpoint` proto), so both decode identically.
export function extractPredictEvents(
  config: Config,
  checkpointData: CheckpointData,
  checkpoint: bigint
): StoredRawEvent[] {
  const storedEvents: StoredRawEvent[] = []
  for (let transactionIndex = 0; transactionIndex < checkpointData.transactions.length; transactionIndex += 1) {
    const transaction = checkpointData.transactions[transactionIndex]
    const events = transaction?.events?.events ?? []
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      const event = events[eventIndex]
      if (event === undefined || event.eventType === undefined) {
        continue
      }
      if (!isPredictEventType(event.eventType, config.predictPackageId)) {
        continue
      }
      storedEvents.push({
        checkpoint: safeNumberSchema.parse(checkpoint),
        eventIndex,
        eventType: event.eventType,
        id: `${checkpoint.toString()}:${transactionIndex}:${eventIndex}`,
        json: protobufValueToJson(event.json),
        module: event.module ?? "",
        packageId: event.packageId ?? "",
        sender: event.sender ?? "",
        transactionDigest: transaction?.digest ?? "",
        transactionIndex,
      })
    }
  }
  return storedEvents
}

// Read a checkpoint via `getCheckpoint` and decode its Predict events. Used by
// the bounded scan; the live tail decodes the pushed proto directly.
export async function readPredictEventsAtCheckpoint(
  config: Config,
  client: SuiClient,
  checkpoint: bigint
): Promise<StoredRawEvent[]> {
  const response = await client.ledgerService.getCheckpoint({
    checkpointId: { oneofKind: "sequenceNumber", sequenceNumber: checkpoint },
    readMask: { paths: [...CHECKPOINT_READ_MASK_PATHS] },
  }).response
  const checkpointData = response.checkpoint
  if (checkpointData === undefined) {
    throw new Error(`Checkpoint ${checkpoint.toString()} was not returned`)
  }

  return extractPredictEvents(config, checkpointData, checkpoint)
}

function minBigint(left: bigint, right: bigint) {
  return left < right ? left : right
}
