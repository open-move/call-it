import type { Config } from "../config.ts"
import type { CheckpointContext, Repository } from "../db/repo.ts"
import { logger, toLogFields } from "../logger.ts"
import type { CheckpointEvent } from "../sui/checkpoint.ts"
import {
  CHECKPOINT_READ_MASK_PATHS,
  checkpointToEvents,
  getLatestCheckpoint,
  isPackageEvent,
  readCheckpoint,
} from "../sui/checkpoint.ts"
import type { SuiClient } from "../sui/client.ts"
import type { IngestGate } from "./gate.ts"

const STRATEGY_PIPELINE_PREFIX = "strategy:"

// Handles a single event that matched the pipeline's package filter. Inserts run
// inside the checkpoint transaction (ctx).
export type CheckpointHandler = (ctx: CheckpointContext, event: CheckpointEvent) => Promise<void>

export interface PipelineDefinition {
  afterBackfill?: (client: SuiClient, repo: Repository) => Promise<void>
  beforeBackfill?: (repo: Repository, from: bigint) => Promise<void>
  handler: CheckpointHandler
  name: string
  // Invoked when the live stream finds the cursor too far behind for a gRPC
  // checkpoint-walk; should close the gap (e.g. via GraphQL backfill) and
  // advance the cursor so the stream can resume.
  onLargeGap?: (input: {
    client: SuiClient
    repo: Repository
    throughSeq: bigint
  }) => Promise<void>
  packageId: string
}

// Parallel read-ahead during backfill. Reads run concurrently but commit in
// strict ascending order so the cursor stays contiguous. Kept modest because
// backfill only ever covers gaps (disconnect windows / fresh-start catch-up).
const BACKFILL_CONCURRENCY = 4

// Per-read retry attempts before a backfill read is considered failed.
const READ_MAX_ATTEMPTS = 4

// Base backoff (ms) for read retries; grows linearly per attempt.
const READ_RETRY_BASE_MS = 250

// Reconnect the stream if no checkpoint arrives within this window. The chain
// produces a checkpoint every few hundred ms, so even a few seconds of silence
// means the (public-node) stream has stalled — reconnect quickly to cut latency.
const STREAM_IDLE_TIMEOUT_MS = 8_000

// Backoff before reopening a closed/stalled stream. Small so a stalled stream
// recovers fast; the missed checkpoints backfill on reconnect regardless.
const STREAM_RECONNECT_BACKOFF_MS = 2_000

// Process one checkpoint: filter to the pipeline package, then commit the
// matched events' inserts + cursor advance in a single transaction. Commits even
// with zero matched events so the cursor advances past empty checkpoints.
export async function processCheckpoint(
  repo: Repository,
  pipeline: PipelineDefinition,
  sequenceNumber: bigint,
  events: CheckpointEvent[]
): Promise<void> {
  const matched = events.filter((event) => isPackageEvent(event.meta.eventType, pipeline.packageId))

  await repo.withCheckpointTransaction(pipeline.name, sequenceNumber, async (ctx) => {
    for (const event of matched) {
      try {
        await pipeline.handler(ctx, event)
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
}

// Backfill [from, to] (inclusive, ascending). Reads run with bounded concurrency
// (read-ahead) but commit strictly in ascending order so the cursor stays
// contiguous. If a read ultimately fails, the backfill stops at the last
// contiguous committed checkpoint (it resumes from the cursor next time).
export async function backfillRange(
  client: SuiClient,
  repo: Repository,
  pipeline: PipelineDefinition,
  from: bigint,
  to: bigint
): Promise<void> {
  if (from > to) {
    return
  }

  logger.info(
    toLogFields({ from: from.toString(), pipeline: pipeline.name, to: to.toString() }),
    "backfill range start"
  )

  if (pipeline.beforeBackfill !== undefined) {
    await pipeline.beforeBackfill(repo, from)
  }

  // Sliding window of in-flight reads keyed by sequence number. We launch up to
  // BACKFILL_CONCURRENCY reads ahead, then await + commit them in order.
  const inflight = new Map<bigint, Promise<CheckpointEvent[] | null>>()
  let next = from
  let committed = from - 1n

  const launch = (seq: bigint) => {
    inflight.set(seq, readCheckpointWithRetry(client, seq))
  }

  // Prime the window.
  for (let i = 0; i < BACKFILL_CONCURRENCY && next <= to; i += 1) {
    launch(next)
    next += 1n
  }

  for (let seq = from; seq <= to; seq += 1n) {
    const pending = inflight.get(seq)
    if (pending === undefined) {
      break
    }
    inflight.delete(seq)

    const events = await pending
    if (events === null) {
      logger.warn(
        toLogFields({
          committedThrough: committed.toString(),
          pipeline: pipeline.name,
          seq: seq.toString(),
        }),
        "backfill read failed; stopping at last contiguous checkpoint"
      )
      return
    }

    await processCheckpoint(repo, pipeline, seq, events)
    committed = seq

    // Keep the read-ahead window full.
    if (next <= to) {
      launch(next)
      next += 1n
    }
  }

  logger.info(
    toLogFields({ committedThrough: committed.toString(), pipeline: pipeline.name }),
    "backfill range done"
  )
}

// Read a checkpoint with bounded retry/backoff. Returns null if all attempts
// fail so the caller can stop the backfill cleanly.
async function readCheckpointWithRetry(client: SuiClient, seq: bigint): Promise<CheckpointEvent[] | null> {
  for (let attempt = 1; attempt <= READ_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await readCheckpoint(client, seq)
      return result.events
    } catch (error) {
      if (attempt === READ_MAX_ATTEMPTS) {
        // Recoverable: backfill stops at the last contiguous checkpoint and the
        // gap is retried on the next stream item / reconnect, so warn (not error).
        logger.warn(
          toLogFields({
            attempt,
            error: error instanceof Error ? error.message : String(error),
            seq: seq.toString(),
          }),
          "checkpoint read failed after retries; will retry gap"
        )
        return null
      }
      await delay(READ_RETRY_BASE_MS * attempt)
    }
  }
  return null
}

// Main per-pipeline driver: subscribe to the live checkpoint stream, decode the
// pushed proto directly, and backfill any gap on demand to keep the cursor
// contiguous. Reconnects on stream close/error until `isStopping()`.
export async function runPipelineStream(
  config: Config,
  client: SuiClient,
  repo: Repository,
  pipeline: PipelineDefinition,
  isStopping: () => boolean,
  gate?: IngestGate
): Promise<void> {
  // Resume from the stored cursor, else the configured start, else the current
  // tip (so a fresh pipeline doesn't backfill from genesis). Persist the chosen
  // start when there was no stored cursor.
  const stored = await repo.getCursor(pipeline.name)
  let cursor: bigint
  if (stored !== null) {
    cursor = stored
  } else {
    cursor = config.ingestStartCheckpoint ?? (await getLatestCheckpoint(client))
    await repo.setCursor(pipeline.name, cursor)
  }

  const backoffMs = STREAM_RECONNECT_BACKOFF_MS

  while (!isStopping()) {
    const abort = new AbortController()
    let reason = "closed"
    try {
      const call = client.subscriptionService.subscribeCheckpoints(
        { readMask: { paths: [...CHECKPOINT_READ_MASK_PATHS] } },
        { abort: abort.signal }
      )

      logger.info(toLogFields({ cursor: cursor.toString(), pipeline: pipeline.name }), "checkpoint stream open")

      // Pull items manually and RACE each `next()` against an idle timeout.
      // gRPC server-streams behind proxies/load balancers can silently stall
      // (no item, no error, no close) — and aborting the controller does NOT
      // reliably unwind a fully-stalled iterator. So instead of trusting abort
      // to break a `for await`, we stop waiting ourselves when no checkpoint
      // arrives in time and reconnect; the missed checkpoints backfill on demand.
      const iterator = call.responses[Symbol.asyncIterator]()
      for (;;) {
        if (isStopping()) {
          break
        }

        const next = iterator.next()
        let idleTimer: ReturnType<typeof setTimeout> | undefined
        const idle = new Promise<"idle">((resolve) => {
          idleTimer = setTimeout(() => resolve("idle"), STREAM_IDLE_TIMEOUT_MS)
        })
        const outcome = await Promise.race([next, idle])
        if (idleTimer !== undefined) {
          clearTimeout(idleTimer)
        }

        if (outcome === "idle") {
          // Don't leak the still-pending next() as an unhandled rejection when
          // we abort the stalled stream below.
          next.then(undefined, () => undefined)
          reason = "idle"
          break
        }
        if (outcome.done === true) {
          break
        }

        const res = outcome.value
        const seq = res.cursor
        const cp = res.checkpoint
        if (seq === undefined || seq <= cursor) {
          continue
        }

        await runWithOptionalGate(gate, async () => {
          cursor = (await repo.getCursor(pipeline.name)) ?? cursor
          if (seq <= cursor) {
            return
          }

          // Contiguity: fill any gap between the cursor and this checkpoint before
          // processing it, so the cursor never skips checkpoints.
          if (seq > cursor + 1n) {
            const gap = seq - cursor - 1n
            if (isStrategyPipeline(pipeline.name) && gap > BigInt(config.strategyMaxGrpcBackfillCheckpoints)) {
              if (pipeline.onLargeGap === undefined) {
                logger.error(
                  toLogFields({
                    cursor: cursor.toString(),
                    gap: gap.toString(),
                    maxGap: config.strategyMaxGrpcBackfillCheckpoints,
                    pipeline: pipeline.name,
                    seq: seq.toString(),
                  }),
                  "strategy checkpoint gap too large for gRPC backfill; run GraphQL strategy backfill"
                )
                throw new Error(`strategy ${pipeline.name} cursor is too far behind for gRPC backfill`)
              }
              // Too far behind for a gRPC checkpoint-walk: close the gap via the
              // GraphQL strategy backfill (sparse event query), then resume the
              // live stream from the advanced cursor on the next item.
              logger.warn(
                toLogFields({
                  cursor: cursor.toString(),
                  gap: gap.toString(),
                  pipeline: pipeline.name,
                  seq: seq.toString(),
                }),
                "strategy gap exceeds gRPC limit; catching up via GraphQL backfill"
              )
              await pipeline.onLargeGap({ client, repo, throughSeq: seq - 1n })
              return
            }
            await backfillRange(client, repo, pipeline, cursor + 1n, seq - 1n)
            cursor = (await repo.getCursor(pipeline.name)) ?? cursor
            if (cursor < seq - 1n) {
              // Backfill stalled; retry the gap on the next stream item / reconnect.
              return
            }
          }

          const events = cp === undefined ? (await readCheckpoint(client, seq)).events : checkpointToEvents(cp, seq)
          await processCheckpoint(repo, pipeline, seq, events)
          cursor = seq
        })
      }
    } catch (error) {
      reason = "error"
      logger.warn(
        toLogFields({
          error: error instanceof Error ? error.message : String(error),
          pipeline: pipeline.name,
        }),
        "checkpoint stream error"
      )
    } finally {
      abort.abort()
    }

    if (isStopping()) {
      return
    }

    logger.warn(
      toLogFields({ backoffMs, cursor: cursor.toString(), pipeline: pipeline.name, reason }),
      "checkpoint stream closed; reconnecting"
    )
    await delay(backoffMs)
  }
}

async function runWithOptionalGate<T>(gate: IngestGate | undefined, run: () => Promise<T>): Promise<T> {
  return gate === undefined ? run() : gate.runExclusive(run)
}

function isStrategyPipeline(name: string): boolean {
  return name.startsWith(STRATEGY_PIPELINE_PREFIX)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
