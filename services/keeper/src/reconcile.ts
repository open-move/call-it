import type { Repository } from "./db/repo.ts"
import { logger } from "./logger.ts"
import { parsePredictEvent } from "./predict.ts"
import type { ParsedPredictEvent, RawPredictEventInput } from "./predict.ts"

export interface ReconcileResult {
  failedEvents: number
  processedEvents: number
}

export interface ReconcileOptions {
  onAfterApply?: (event: RawPredictEventInput) => void
}

const RECONCILE_LIMIT = 500

export async function reconcileEvents(repo: Repository, options: ReconcileOptions = {}): Promise<ReconcileResult> {
  let processedEvents = 0
  let failedEvents = 0

  while (true) {
    const events = await repo.listUnreconciledRawEvents(RECONCILE_LIMIT)
    if (events.length === 0) {
      return { failedEvents, processedEvents }
    }

    for (const event of events) {
      try {
        repo.withTransaction((txRepo) => {
          const input = { eventType: event.eventType, json: event.json }
          const parsed = parsePredictEvent(input)
          if (parsed !== null) {
            applyParsedEvent(txRepo, parsed, event.checkpoint)
            options.onAfterApply?.(input)
          }
          txRepo.markRawEventReconciled(event.id)
        })
        processedEvents += 1
      } catch (error) {
        // Quarantine the event instead of letting one malformed payload stall
        // the queue forever (it would be re-fetched and re-thrown every tick).
        const message = error instanceof Error ? error.message : String(error)
        logger.error(
          { checkpoint: event.checkpoint, error: message, eventId: event.id, eventType: event.eventType },
          "reconcile event failed"
        )
        await repo.markRawEventFailed(event.id, message)
        failedEvents += 1
      }
    }
  }
}

function applyParsedEvent(repo: Repository, parsed: ParsedPredictEvent, checkpoint: number): void {
  if (parsed.kind === "OracleSettled") {
    repo.upsertOracleSettled(parsed.value, checkpoint)
  } else if (parsed.kind === "PositionMinted") {
    repo.applyMint(parsed.value, checkpoint)
  } else {
    repo.applyRedeem(parsed.value, checkpoint)
  }
}
