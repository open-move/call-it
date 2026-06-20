import { formatBps } from "@/lib/shield/format"
import type { HedgedPlpStrategyState } from "@/services/shield-client"
import { DataRow } from "@/components/primitives/data-row"

export function ShieldPolicyCard({
  strategy,
}: {
  strategy?: HedgedPlpStrategyState
}) {
  return (
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
        Policy
      </h2>

      <div className="mt-4">
        <DataRow
          label="Hedge budget"
          value={strategy ? formatBps(strategy.policy.hedgeBudgetBps) : "—"}
        />
        <DataRow
          label="Reserve"
          value={strategy ? formatBps(strategy.policy.reserveBps) : "—"}
        />
        <DataRow
          label="PLP allocation cap"
          value={
            strategy ? formatBps(strategy.policy.maxPlpAllocationBps) : "—"
          }
        />
        <DataRow
          label="Strike band"
          value={strategy ? formatBps(strategy.policy.strikeBandBps) : "—"}
        />
        <DataRow
          label="Max hedge ask"
          value={strategy ? formatBps(strategy.policy.maxHedgeAskBps) : "—"}
        />
      </div>
    </div>
  )
}
