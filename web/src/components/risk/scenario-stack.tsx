import { Button } from "@/components/ui/button"
import { formatPercent } from "@/lib/format"
import {
  formatDusdc,
  getScenarioAccentClassName,
  getSeverityPercent,
  scenarioGroups,
} from "@/lib/risk/helpers"
import type {
  RiskScenarioId,
  RiskScenarioRow,
} from "@/lib/risk/types"
import type { RiskScenarioGroup } from "@/lib/risk/types"
import { cn } from "@/lib/utils"

function ScenarioStackRow({
  onSelect,
  row,
  selected,
}: {
  onSelect: () => void
  row: RiskScenarioRow
  selected: boolean
}) {
  return (
    <button
      className={cn(
        "w-full px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
        selected ? "bg-primary/10" : "hover:bg-muted/25"
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-xs font-medium text-foreground">
          {row.label}
        </span>
        <span
          className={cn(
            "font-mono text-[10px] uppercase tabular-nums",
            getScenarioAccentClassName(row.tone)
          )}
        >
          {formatPercent(row.drawdownPct)}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-background/80">
        <div
          className={cn(
            "h-full rounded-full",
            row.drawdownPct >= 0.12 ? "bg-outcome-down" : "bg-chart-4"
          )}
          style={{ width: `${getSeverityPercent(row)}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
        <span className="truncate">{row.shockSummary}</span>
        <span>{formatDusdc(row.estimatedLiability, 0)}</span>
      </div>
    </button>
  )
}

export function ScenarioStack({
  onGroupChange,
  onScenarioChange,
  rows,
  selectedGroup,
  selectedScenario,
}: {
  onGroupChange: (group: RiskScenarioGroup) => void
  onScenarioChange: (scenarioId: RiskScenarioId) => void
  rows: RiskScenarioRow[]
  selectedGroup: RiskScenarioGroup
  selectedScenario: RiskScenarioRow
}) {
  return (
    <aside className="border-b border-border/45 xl:border-r xl:border-b-0">
      <div className="border-b border-border/35 px-3 py-3">
        <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Scenario Stack
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {scenarioGroups.map((group) => (
            <Button
              className={cn(
                "h-7 px-2.5 text-[11px] shadow-none",
                selectedGroup === (group.id as RiskScenarioGroup) && "bg-primary/10 text-primary"
              )}
              key={group.id}
              onClick={() => onGroupChange(group.id as RiskScenarioGroup)}
              size="xs"
              type="button"
              variant="ghost"
            >
              {group.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-border/30">
        {rows.map((row) => (
          <ScenarioStackRow
            key={row.id}
            onSelect={() => onScenarioChange(row.id)}
            row={row}
            selected={row.id === selectedScenario.id}
          />
        ))}
      </div>
    </aside>
  )
}
