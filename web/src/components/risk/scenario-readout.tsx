import { formatPercent, formatUsd } from "@/lib/format"
import {
  formatDusdc,
  formatSharePrice,
  getDrawdownClassName,
  getSeverityPercent,
} from "@/lib/risk/helpers"
import type { RiskScenarioRow } from "@/lib/risk/types"
import { cn } from "@/lib/utils"

export function ReadoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}

export function ScenarioReadout({
  selectedScenario,
  worstScenario,
}: {
  selectedScenario: RiskScenarioRow
  worstScenario: RiskScenarioRow
}) {
  return (
    <aside className="border-t border-border/45 px-4 py-4 xl:border-t-0 xl:border-l">
      <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
        Selected Shock
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {selectedScenario.description}
      </p>

      <div className="mt-4 rounded-md border border-border/35 bg-muted/15 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-foreground">
              {selectedScenario.label}
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {selectedScenario.shockSummary}
            </div>
          </div>
          <div
            className={cn(
              "font-mono text-xl leading-tight font-medium tabular-nums",
              getDrawdownClassName(selectedScenario.drawdownPct)
            )}
          >
            {formatPercent(selectedScenario.drawdownPct)}
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background/80">
          <div
            className="h-full rounded-full bg-outcome-down"
            style={{ width: `${getSeverityPercent(selectedScenario)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 space-y-2 rounded-md border border-border/35 bg-muted/15 p-3">
        <ReadoutRow
          label="Settlement"
          value={formatUsd(selectedScenario.estimatedSettlementPriceUsd, 0)}
        />
        <ReadoutRow
          label="Liability"
          value={formatDusdc(selectedScenario.estimatedLiability)}
        />
        <ReadoutRow
          label="Vault value"
          value={formatDusdc(selectedScenario.estimatedVaultValue)}
        />
        <ReadoutRow
          label="PLP price"
          value={formatSharePrice(selectedScenario.estimatedSharePrice)}
        />
      </div>

      <div className="mt-3 rounded-md border border-border/35 bg-muted/15 p-3">
        <div className="text-xs font-medium text-foreground">Worst modeled</div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="truncate text-xs text-muted-foreground">
            {worstScenario.label}
          </span>
          <span
            className={cn(
              "font-mono text-xs font-medium tabular-nums",
              getDrawdownClassName(worstScenario.drawdownPct)
            )}
          >
            {formatPercent(worstScenario.drawdownPct)}
          </span>
        </div>
      </div>
    </aside>
  )
}
