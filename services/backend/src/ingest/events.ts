import type { Config } from "../config.ts"
import type { Repository, CheckpointContext } from "../db/repo.ts"
import type { SuiClient } from "../sui/client.ts"
import type { CheckpointEvent } from "../sui/checkpoint.ts"
import { getLatestCheckpoint, isPackageEvent, readCheckpoint } from "../sui/checkpoint.ts"
import { logger, toLogFields } from "../logger.ts"

export interface ScanResult {
  fromCheckpoint: bigint | null
  insertedEvents: number
  latestCheckpoint: bigint
  pipeline: string
  scannedCheckpoints: number
  toCheckpoint: bigint | null
}

// Handles every event in a single checkpoint that matched the pipeline's
// package filter. Inserts run inside the checkpoint transaction (ctx).
export type CheckpointHandler = (ctx: CheckpointContext, event: CheckpointEvent) => Promise<void>

export interface PipelineDefinition {
  handler: CheckpointHandler
  name: string
  packageId: string
}

// Generic checkpoint scanner. For each checkpoint in range, reads events via
// gRPC, filters by the pipeline package id, and routes matches to the handler.
// Each checkpoint's inserts + cursor advance commit in one transaction; if a
// checkpoint has no start cursor yet, it is initialized without scanning.
export async function scanPipeline(
  config: Config,
  client: SuiClient,
  repo: Repository,
  pipeline: PipelineDefinition
): Promise<ScanResult> {
  const latestCheckpoint = await getLatestCheckpoint(client)
  const lastScanned = await repo.getCursor(pipeline.name)

  if (lastScanned === null) {
    const startingCheckpoint = config.ingestStartCheckpoint ?? latestCheckpoint
    await repo.setCursor(pipeline.name, startingCheckpoint)
    return emptyResult(pipeline.name, latestCheckpoint)
  }

  const fromCheckpoint = lastScanned + 1n
  if (fromCheckpoint > latestCheckpoint) {
    return emptyResult(pipeline.name, latestCheckpoint)
  }

  const toCheckpoint = minBigint(
    latestCheckpoint,
    lastScanned + BigInt(config.ingestMaxCheckpointsPerScan)
  )

  let insertedEvents = 0
  let checkpoint = fromCheckpoint
  while (checkpoint <= toCheckpoint) {
    insertedEvents += await scanSingleCheckpoint(client, repo, pipeline, checkpoint)
    checkpoint += 1n
  }

  return {
    fromCheckpoint,
    insertedEvents,
    latestCheckpoint,
    pipeline: pipeline.name,
    scannedCheckpoints: Number(toCheckpoint - fromCheckpoint + 1n),
    toCheckpoint,
  }
}

async function scanSingleCheckpoint(
  client: SuiClient,
  repo: Repository,
  pipeline: PipelineDefinition,
  checkpoint: bigint
): Promise<number> {
  const { events } = await readCheckpoint(client, checkpoint)
  const matched = events.filter((event) => isPackageEvent(event.meta.eventType, pipeline.packageId))

  let inserted = 0
  await repo.withCheckpointTransaction(pipeline.name, checkpoint, async (ctx) => {
    for (const event of matched) {
      try {
        await pipeline.handler(ctx, event)
        inserted += 1
      } catch (error) {
        logger.error(
          toLogFields({
            error: error instanceof Error ? error.message : String(error),
            eventId: event.meta.eventId,
            eventType: event.meta.eventType,
            pipeline: pipeline.name,
          }),
          "event handler failed"
        )
        throw error
      }
    }
  })

  return inserted
}

function emptyResult(pipeline: string, latestCheckpoint: bigint): ScanResult {
  return {
    fromCheckpoint: null,
    insertedEvents: 0,
    latestCheckpoint,
    pipeline,
    scannedCheckpoints: 0,
    toCheckpoint: null,
  }
}

function minBigint(left: bigint, right: bigint): bigint {
  return left < right ? left : right
}
