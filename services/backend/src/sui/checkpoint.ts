import { z } from "zod"

import type { SuiClient } from "./client.ts"
import { protobufValueToJson } from "./client.ts"

const safeNumberSchema = z
  .bigint()
  .refine((value) => value <= BigInt(Number.MAX_SAFE_INTEGER), "value exceeds Number.MAX_SAFE_INTEGER")
  .transform((value) => Number(value))

// Header carried by every indexed event. `eventId` (`${digest}:${eventIndex}`)
// is the dedup primary key for raw + projection inserts.
export interface EventMeta {
  checkpoint: number
  checkpointTimestampMs: number
  digest: string
  eventId: string
  eventIndex: number
  eventType: string
  module: string
  packageId: string
  sender: string
  txIndex: number
}

// A single decoded-from-checkpoint event: header + the raw payloads we persist.
// `contents` are the BCS bytes (preferred decode path); `json` is the
// protobuf-json fallback shape.
export interface CheckpointEvent {
  contents: Uint8Array | null
  json: unknown
  meta: EventMeta
}

export interface ReadCheckpointResult {
  events: CheckpointEvent[]
  timestampMs: number
}

export async function getLatestCheckpoint(client: SuiClient): Promise<bigint> {
  const serviceInfo = await client.ledgerService.getServiceInfo({}).response
  return serviceInfo.checkpointHeight ?? 0n
}

// Read a checkpoint via gRPC and return every event in
// (txIndex, eventIndex) order. Package filtering is left to the caller so a
// single checkpoint read can feed multiple pipelines.
export async function readCheckpoint(
  client: SuiClient,
  checkpoint: bigint
): Promise<ReadCheckpointResult> {
  const response = await client.ledgerService.getCheckpoint({
    checkpointId: { oneofKind: "sequenceNumber", sequenceNumber: checkpoint },
    readMask: {
      paths: [
        "sequence_number",
        "summary.timestamp",
        "transactions.digest",
        "transactions.transaction",
        "transactions.events",
      ],
    },
  }).response

  const checkpointData = response.checkpoint
  if (checkpointData === undefined) {
    throw new Error(`Checkpoint ${checkpoint.toString()} was not returned`)
  }

  const timestampMs = protoTimestampToMs(checkpointData.summary?.timestamp)
  const checkpointNumber = safeNumberSchema.parse(checkpoint)

  const events: CheckpointEvent[] = []
  for (let txIndex = 0; txIndex < checkpointData.transactions.length; txIndex += 1) {
    const transaction = checkpointData.transactions[txIndex]
    const digest = transaction?.digest ?? ""
    const txEvents = transaction?.events?.events ?? []
    for (let eventIndex = 0; eventIndex < txEvents.length; eventIndex += 1) {
      const event = txEvents[eventIndex]
      if (event === undefined || event.eventType === undefined) {
        continue
      }
      events.push({
        contents: event.contents?.value ?? null,
        json: protobufValueToJson(event.json),
        meta: {
          checkpoint: checkpointNumber,
          checkpointTimestampMs: timestampMs,
          digest,
          eventId: `${digest}:${eventIndex}`,
          eventIndex,
          eventType: event.eventType,
          module: event.module ?? "",
          packageId: event.packageId ?? "",
          sender: event.sender ?? "",
          txIndex,
        },
      })
    }
  }

  return { events, timestampMs }
}

// google.protobuf.Timestamp -> epoch milliseconds.
function protoTimestampToMs(timestamp: { seconds?: bigint; nanos?: number } | undefined): number {
  if (timestamp === undefined) {
    return 0
  }
  const seconds = timestamp.seconds ?? 0n
  const nanos = timestamp.nanos ?? 0
  return Number(seconds) * 1000 + Math.floor(nanos / 1_000_000)
}

export function isPackageEvent(eventType: string, packageId: string): boolean {
  return eventType.toLowerCase().startsWith(`${packageId.toLowerCase()}::`)
}
