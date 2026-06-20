import { formatPercent } from "@/lib/format"
import {
  formatDusdc,
  formatQuoteAmount,
  getDrawdownClassName,
  getSeverityPercent,
} from "@/lib/risk/helpers"
import type { RiskModel, RiskScenarioRow } from "@/lib/risk/types"
import { cn } from "@/lib/utils"

function BaselineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

export function RiskHero({
  model,
  selectedScenario,
}: {
  model: RiskModel
  selectedScenario: RiskScenarioRow
}) {
  const severity = getSeverityPercent(selectedScenario)

  return (
    <div className="rounded-lg bg-card p-4 sm:p-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            Stress test · {selectedScenario.label}
          </div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-pretty text-muted-foreground">
            {selectedScenario.description}
          </p>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={cn(
                "font-mono text-4xl leading-none font-semibold tracking-tight tabular-nums",
                getDrawdownClassName(selectedScenario.drawdownPct)
              )}
            >
              {formatPercent(selectedScenario.drawdownPct)}
            </span>
            <span className="text-sm text-muted-foreground">
              modeled drawdown →{" "}
              <span className="font-mono font-medium text-foreground tabular-nums">
                {formatDusdc(selectedScenario.estimatedLiability, 0)}
              </span>{" "}
              liability
            </span>
          </div>

          <div className="mt-4 max-w-md">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Calm</span>
              <span>Severe</span>
            </div>
            <div className="relative mt-1.5 h-1.5 rounded-full bg-gradient-to-r from-outcome-up/40 via-chart-4/55 to-outcome-down/70">
              <span
                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-card transition-[left] duration-300"
                style={{ left: `${severity}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 lg:w-64 lg:grid-cols-1 lg:gap-3 lg:border-l lg:border-border/40 lg:pl-5">
          <BaselineStat
            label="Strategy NAV"
            value={formatQuoteAmount(model.summary.vault_value)}
          />
          <BaselineStat
            label="Withdrawable"
            value={formatQuoteAmount(model.summary.available_withdrawal)}
          />
          <BaselineStat
            label="Open max payout"
            value={formatQuoteAmount(model.summary.total_max_payout)}
          />
        </div>
      </div>
    </div>
  )
}
