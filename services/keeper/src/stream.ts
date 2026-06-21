import type { Config } from "./config.ts"
import type { Repository } from "./db/repo.ts"
import { logger, toLogFields } from "./logger.ts"
import type { CheckpointData } from "./scan.ts"
import { CHECKPOINT_READ_MASK_PATHS, extractPredictEvents } from "./scan.ts"
import type { SuiClient } from "./sui.ts"

// Parallel read-ahead during backfill. Reads run concurrently but commit in
// strict ascending order so the cursor stays contiguous. Kept modest because
// backfill only ever covers gaps (disconnect windows / fresh-start catch-up).
const BACKFILL_CONCURRENCY = 4

// Per-checkpoint read attempts, covering BOTH transient RPC errors AND the
// json-projection lag: the node populates an event's protobuf-json a few seconds
// after the checkpoint first appears, so a tip read can return events with null
// json. We retry until matched Predict events carry json (or the budget spends).
const READ_MAX_ATTEMPTS = 12

// Base backoff (ms) per attempt; grows linearly, capped, so the budget spans
// ~20s — enough for the json projection to catch up at the chain tip.
const READ_RETRY_BASE_MS = 500
const READ_RETRY_CAP_MS = 2_000

// Reconnect the stream if no checkpoint arrives within this window. The chain
// produces a checkpoint every few hundred ms, so even a few seconds of silence
// means the (public-node) stream has stalled — reconnect quickly to cut latency.
const STREAM_IDLE_TIMEOUT_MS = 8_000

// Backoff before reopening a closed/stalled stream. Small so a stalled stream
// recovers fast; the missed checkpoints backfill on reconnect regardless.
const STREAM_RECONNECT_BACKOFF_MS = 2_000

// Process one checkpoint: decode its Predict events, persist them, then advance
// the cursor. Insert-before-advance is deliberate: `insertRawEvents` dedups on
// `id`, so if we crash between insert and advance the checkpoint is simply
// reprocessed (idempotently) next time. Returns the number of inserted events.
export async function processCheckpoint(
  config: Config,
  repo: Repository,
  checkpoint: bigint,
  checkpointData: CheckpointData
): Promise<number> {
  const events = extractPredictEvents(config, checkpointData, checkpoint)
  const inserted = await repo.insertRawEvents(events)
  await repo.setLastScannedCheckpoint(checkpoint)
  return inserted
}

// Backfill [from, to] (inclusive, ascending). Reads run with bounded concurrency
// (read-ahead) but commit strictly in ascending order so the cursor stays
// contiguous. If a read ultimately fails, the backfill stops at the last
// contiguous committed checkpoint (it resumes from the cursor next time).
export async function backfillRange(
  config: Config,
  client: SuiClient,
  repo: Repository,
  from: bigint,
  to: bigint
): Promise<void> {
  if (from > to) {
    return
  }

  logger.info(toLogFields({ from: from.toString(), to: to.toString() }), "backfill range start")

  // Sliding window of in-flight reads keyed by sequence number. We launch up to
  // BACKFILL_CONCURRENCY reads ahead, then await + commit them in order.
  const inflight = new Map<bigint, Promise<CheckpointData | null>>()
  let next = from
  let committed = from - 1n

  const launch = (seq: bigint) => {
    inflight.set(seq, fetchReadyCheckpoint(config, client, seq))
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

    const checkpointData = await pending
    if (checkpointData === null) {
      logger.warn(
        toLogFields({ committedThrough: committed.toString(), seq: seq.toString() }),
        "backfill read failed; stopping at last contiguous checkpoint"
      )
      return
    }

    await processCheckpoint(config, repo, seq, checkpointData)
    committed = seq

    // Keep the read-ahead window full.
    if (next <= to) {
      launch(next)
      next += 1n
    }
  }

  logger.info(toLogFields({ committedThrough: committed.toString() }), "backfill range done")
}

// Read a checkpoint proto, retrying on transient errors AND while the json
// projection is still catching up (matched Predict events whose `json` is null
// at the tip). Returns the proto once its Predict events carry json, the
// best-effort proto if the readiness budget is spent (a rare straggler that
// re-resolves on a later pass), or null if the read itself keeps failing.
async function fetchReadyCheckpoint(
  config: Config,
  client: SuiClient,
  seq: bigint
): Promise<CheckpointData | null> {
  let lastData: CheckpointData | null = null
  for (let attempt = 1; attempt <= READ_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await client.ledgerService.getCheckpoint({
        checkpointId: { oneofKind: "sequenceNumber", sequenceNumber: seq },
        readMask: { paths: [...CHECKPOINT_READ_MASK_PATHS] },
      }).response
      const checkpointData = response.checkpoint
      if (checkpointData === undefined) {
        throw new Error(`Checkpoint ${seq.toString()} was not returned`)
      }
      lastData = checkpointData
      // Ready once every matched Predict event carries json (none matched ⇒ ready).
      if (extractPredictEvents(config, checkpointData, seq).every((event) => event.json !== null)) {
        return checkpointData
      }
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
    }
    await delay(Math.min(READ_RETRY_CAP_MS, READ_RETRY_BASE_MS * attempt))
  }
  return lastData
}

// Main ingestion driver: subscribe to the live checkpoint stream, decode the
// pushed proto directly, and backfill any gap on demand to keep the cursor
// contiguous. Reconnects on stream close/error until `isStopping()`. Resumes
// from the stored cursor, which `seedStartCheckpointIfFresh` has already seeded.
export async function runCheckpointStream(
  config: Config,
  client: SuiClient,
  repo: Repository,
  isStopping: () => boolean
): Promise<void> {
  const stored = await repo.getLastScannedCheckpoint()
  if (stored === null) {
    throw new Error("scan cursor missing; seedStartCheckpointIfFresh must run before the stream")
  }
  let cursor = stored

  const backoffMs = STREAM_RECONNECT_BACKOFF_MS

  while (!isStopping()) {
    const abort = new AbortController()
    let reason = "closed"
    try {
      const call = client.subscriptionService.subscribeCheckpoints(
        { readMask: { paths: [...CHECKPOINT_READ_MASK_PATHS] } },
        { abort: abort.signal }
      )

      logger.info(toLogFields({ cursor: cursor.toString() }), "checkpoint stream open")

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

        // Contiguity: fill any gap between the cursor and this checkpoint before
        // processing it, so the cursor never skips checkpoints.
        if (seq > cursor + 1n) {
          await backfillRange(config, client, repo, cursor + 1n, seq - 1n)
          cursor = (await repo.getLastScannedCheckpoint()) ?? cursor
          if (cursor < seq - 1n) {
            // Backfill stalled; retry the gap on the next stream item / reconnect.
            continue
          }
        }

        // The pushed proto carries event types + BCS but NOT the protobuf-json
        // projection the parser needs (it lags the tip by a few seconds). So if
        // the checkpoint actually has Predict events, fetch via getCheckpoint and
        // wait out the json lag; empty checkpoints use the proto directly (no
        // fetch). Predict events are sparse, so the extra read is rare.
        const streamedEvents = cp ? extractPredictEvents(config, cp, seq) : []
        if (cp !== undefined && streamedEvents.length === 0) {
          await processCheckpoint(config, repo, seq, cp)
          cursor = seq
        } else {
          const ready = await fetchReadyCheckpoint(config, client, seq)
          if (ready === null) {
            // Can't read it yet — leave the cursor; the next stream item's gap
            // backfill retries it.
            continue
          }
          await processCheckpoint(config, repo, seq, ready)
          cursor = seq
        }
      }
    } catch (error) {
      reason = "error"
      logger.warn(
        toLogFields({ error: error instanceof Error ? error.message : String(error) }),
        "checkpoint stream error"
      )
    } finally {
      abort.abort()
    }

    if (isStopping()) {
      return
    }

    logger.warn(
      toLogFields({ backoffMs, cursor: cursor.toString(), reason }),
      "checkpoint stream closed; reconnecting"
    )
    await delay(backoffMs)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
