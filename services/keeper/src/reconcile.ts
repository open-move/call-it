import type { Repository } from "./db/repo.ts"
import { logger } from "./logger.ts"
import { parsePredictEvent } from "./predict.ts"

export interface ReconcileResult {
  failedEvents: number
  processedEvents: number
}

const RECONCILE_LIMIT = 500

export async function reconcileEvents(repo: Repository): Promise<ReconcileResult> {
  let processedEvents = 0
  let failedEvents = 0

  while (true) {
    const events = await repo.listUnreconciledRawEvents(RECONCILE_LIMIT)
    if (events.length === 0) {
      return { failedEvents, processedEvents }
    }

    for (const event of events) {
      try {
        const parsed = parsePredictEvent({ eventType: event.eventType, json: event.json })
        if (parsed !== null) {
          if (parsed.kind === "OracleSettled") {
            await repo.upsertOracleSettled(parsed.value, event.checkpoint)
          } else if (parsed.kind === "PositionMinted") {
            await repo.applyMint(parsed.value, event.checkpoint)
          } else {
            await repo.applyRedeem(parsed.value, event.checkpoint)
          }
        }
        await repo.markRawEventReconciled(event.id)
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
