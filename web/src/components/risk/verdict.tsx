import { formatPercent } from "@/lib/format"
import {
  formatDusdc,
  getDrawdownClassName,
  getScenarioAccentClassName,
  getSeverityPercent,
  getWorstScenario,
} from "@/lib/risk/helpers"
import type {
  RiskModel,
  RiskScenarioId,
  RiskScenarioRow,
} from "@/lib/risk/types"
import { cn } from "@/lib/utils"

export function RiskVerdict({
  model,
  onScenarioChange,
  selectedScenario,
}: {
  model: RiskModel
  onScenarioChange: (scenarioId: RiskScenarioId) => void
  selectedScenario: RiskScenarioRow
}) {
  const severity = getSeverityPercent(selectedScenario)
  const worst = getWorstScenario(model.scenarioRows)
  const isWorstSelected = worst.id === selectedScenario.id

  return (
    <div className="grid gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full bg-current",
              getScenarioAccentClassName(selectedScenario.tone)
            )}
          />
          <span>
            Selected stress ·{" "}
            <span className="font-medium text-foreground">
              {selectedScenario.label}
            </span>
          </span>
        </div>
        <p className="mt-1.5 max-w-xl text-xs leading-5 text-pretty text-muted-foreground">
          {selectedScenario.description}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
          <span
            className={cn(
              "font-mono text-4xl leading-none font-semibold tracking-tight tabular-nums sm:text-5xl",
              getDrawdownClassName(selectedScenario.drawdownPct)
            )}
          >
            {formatPercent(selectedScenario.drawdownPct)}
          </span>
          <div className="pb-1 text-xs leading-tight text-muted-foreground">
            <div>modeled drawdown</div>
            <div className="mt-0.5">
              <span className="font-mono font-medium text-foreground tabular-nums">
                {formatDusdc(selectedScenario.estimatedLiability, 0)}
              </span>{" "}
              liability
            </div>
          </div>
        </div>
      </div>

      <div className="lg:border-l lg:border-border/40 lg:pl-6">
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

        <button
          className={cn(
            "mt-3 flex w-full items-center justify-between gap-2 rounded-md border border-border/40 px-2.5 py-1.5 text-left text-[11px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            isWorstSelected ? "cursor-default opacity-70" : "hover:bg-muted/25"
          )}
          disabled={isWorstSelected}
          onClick={() => onScenarioChange(worst.id)}
          type="button"
        >
          <span className="shrink-0 text-muted-foreground">
            Worst modeled case
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-foreground">{worst.label}</span>
            <span
              className={cn(
                "shrink-0 font-mono font-medium tabular-nums",
                getDrawdownClassName(worst.drawdownPct)
              )}
            >
              {formatPercent(worst.drawdownPct)}
            </span>
          </span>
        </button>
      </div>
    </div>
  )
}
