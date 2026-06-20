import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatBps } from "@/lib/shield/format"
import type { ShieldStrategyState } from "@/services/shield-client"

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

export function ShieldPolicyCard({ strategy }: { strategy?: ShieldStrategyState }) {
  return (
    <Card className="gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Strategy Policy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pt-2 pb-4">
        <PolicyRow
          label="Hedge budget"
          value={strategy ? formatBps(strategy.policy.hedgeBudgetBps) : "--"}
        />
        <PolicyRow
          label="Reserve"
          value={strategy ? formatBps(strategy.policy.reserveBps) : "--"}
        />
        <PolicyRow
          label="PLP allocation cap"
          value={strategy ? formatBps(strategy.policy.maxPlpAllocationBps) : "--"}
        />
        <PolicyRow
          label="Strike band"
          value={strategy ? formatBps(strategy.policy.strikeBandBps) : "--"}
        />
        <PolicyRow
          label="Max hedge ask"
          value={strategy ? formatBps(strategy.policy.maxHedgeAskBps) : "--"}
        />
      </CardContent>
    </Card>
  )
}
