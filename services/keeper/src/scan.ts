import type { Config } from "./config.ts"
import type { Repository } from "./db/repo.ts"
import { isPredictEventType } from "./predict.ts"
import type { SuiClient } from "./sui.ts"
import { protobufValueToJson } from "./sui.ts"
import { z } from "zod"

const safeNumberSchema = z
  .bigint()
  .refine((value) => value <= BigInt(Number.MAX_SAFE_INTEGER), "value exceeds Number.MAX_SAFE_INTEGER")
  .transform((value) => Number(value))

export interface ScanResult {
  fromCheckpoint: bigint | null
  insertedEvents: number
  latestCheckpoint: bigint
  scannedCheckpoints: number
  toCheckpoint: bigint | null
}

export async function scanPredictEvents(
  config: Config,
  client: SuiClient,
  repo: Repository
): Promise<ScanResult> {
  const serviceInfo = await client.ledgerService.getServiceInfo({}).response
  const latestCheckpoint = serviceInfo.checkpointHeight ?? 0n
  const lastScanned = await repo.getLastScannedCheckpoint()

  if (lastScanned === null) {
    if (config.startCheckpoint === null) {
      // Starting at "latest" would silently skip every pre-existing position —
      // exactly the redeemables a keeper exists to find. Make the horizon explicit.
      throw new Error(
        "KEEPER_START_CHECKPOINT is required for a new keeper DB; the keeper only manages positions from this checkpoint forward"
      )
    }
    const startingCheckpoint = config.startCheckpoint
    await repo.setLastScannedCheckpoint(startingCheckpoint)
    return {
      fromCheckpoint: null,
      insertedEvents: 0,
      latestCheckpoint,
      scannedCheckpoints: 0,
      toCheckpoint: null,
    }
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

async function readPredictEventsAtCheckpoint(
  config: Config,
  client: SuiClient,
  checkpoint: bigint
) {
  const response = await client.ledgerService.getCheckpoint({
    checkpointId: { oneofKind: "sequenceNumber", sequenceNumber: checkpoint },
    readMask: { paths: ["sequence_number", "transactions.digest", "transactions.events"] },
  }).response
  const checkpointData = response.checkpoint
  if (checkpointData === undefined) {
    throw new Error(`Checkpoint ${checkpoint.toString()} was not returned`)
  }

  const storedEvents = []
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

function minBigint(left: bigint, right: bigint) {
  return left < right ? left : right
}
