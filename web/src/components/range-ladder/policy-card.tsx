import { DataRow } from "@/components/primitives/data-row"
import { formatBps } from "@/lib/range-ladder/format"
import type { RangeLadderStrategyState } from "@/services/range-ladder-client"

export function PolicyCard({
  strategy,
}: {
  strategy?: RangeLadderStrategyState
}) {
  return (
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
        Policy
      </h2>

      <div className="mt-4">
        <DataRow
          label="Premium budget"
          value={strategy ? formatBps(strategy.policy.premiumBudgetBps) : "—"}
        />
        <DataRow
          label="Reserve"
          value={strategy ? formatBps(strategy.policy.reserveBps) : "—"}
        />
        <DataRow
          label="Max range ask"
          value={strategy ? formatBps(strategy.policy.maxRangeAskBps) : "—"}
        />
        <DataRow
          label="Max rungs"
          value={strategy ? strategy.policy.maxRungCount.toString() : "—"}
        />
      </div>
    </div>
  )
}
