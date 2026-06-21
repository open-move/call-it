import type { KeeperRepository } from "./db/repo.ts"
import { parsePredictEvent } from "./predict.ts"

export interface ReconcileResult {
  processedEvents: number
}

const RECONCILE_LIMIT = 500

export async function reconcileEvents(repo: KeeperRepository): Promise<ReconcileResult> {
  let processedEvents = 0

  while (true) {
    const events = await repo.listUnreconciledRawEvents(RECONCILE_LIMIT)
    if (events.length === 0) {
      return { processedEvents }
    }

    for (const event of events) {
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
    }
  }
}
