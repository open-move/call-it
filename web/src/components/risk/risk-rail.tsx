import { formatPercent } from "@/lib/format"
import { formatQuoteAmount, getDrawdownClassName } from "@/lib/risk/helpers"
import type { RiskModel, RiskScenarioRow } from "@/lib/risk/types"
import { cn } from "@/lib/utils"

function RailCell({
  className,
  emphasis = false,
  label,
  meta,
  value,
}: {
  className?: string
  emphasis?: boolean
  label: string
  meta: string
  value: string
}) {
  return (
    <div className="border-b border-border/35 px-3 py-2.5 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0">
      <div className="text-xs leading-none text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-2 truncate font-mono font-medium text-foreground tabular-nums",
          emphasis ? "text-xl leading-tight" : "text-sm",
          className
        )}
      >
        {value}
      </div>
      <div className="mt-1 truncate font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {meta}
      </div>
    </div>
  )
}

export function RiskRail({
  model,
  worstScenario,
}: {
  model: RiskModel
  worstScenario: RiskScenarioRow
}) {
  return (
    <div className="grid border-b border-border/45 bg-muted/10 md:grid-cols-4">
      <RailCell
        label="Strategy value"
        meta="Current PLP NAV"
        value={formatQuoteAmount(model.summary.vault_value)}
      />
      <RailCell
        label="Withdrawable"
        meta="Current liquidity"
        value={formatQuoteAmount(model.summary.available_withdrawal)}
      />
      <RailCell
        label="Open max payout"
        meta={`${formatPercent(model.summary.max_payout_utilization)} utilization`}
        value={formatQuoteAmount(model.summary.total_max_payout)}
      />
      <RailCell
        className={getDrawdownClassName(worstScenario.drawdownPct)}
        emphasis
        label="Worst drawdown"
        meta={worstScenario.label}
        value={formatPercent(worstScenario.drawdownPct)}
      />
    </div>
  )
}
