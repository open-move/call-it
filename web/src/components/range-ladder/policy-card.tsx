import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatBps } from "@/lib/range-ladder/format"
import type { RangeLadderStrategyState } from "@/services/range-ladder-client"

export function PolicyCard({ strategy }: { strategy?: RangeLadderStrategyState }) {
  return (
    <Card className="gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Strategy Policy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pt-2 pb-4">
        <PolicyRow
          label="Premium budget"
          value={strategy ? formatBps(strategy.policy.premiumBudgetBps) : "--"}
        />
        <PolicyRow
          label="Reserve"
          value={strategy ? formatBps(strategy.policy.reserveBps) : "--"}
        />
        <PolicyRow
          label="Max range ask"
          value={strategy ? formatBps(strategy.policy.maxRangeAskBps) : "--"}
        />
        <PolicyRow
          label="Max rungs"
          value={strategy ? strategy.policy.maxRungCount.toString() : "--"}
        />
      </CardContent>
    </Card>
  )
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/35 pb-2 last:border-b-0 last:pb-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}
