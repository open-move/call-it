import { formatPercent, formatUsd } from "@/lib/format"
import {
  formatDusdc,
  formatSharePrice,
  getDrawdownClassName,
} from "@/lib/risk/helpers"
import type { RiskScenarioId, RiskScenarioRow } from "@/lib/risk/types"
import { cn } from "@/lib/utils"
import { TableValue } from "./table-value"

const gridTemplate =
  "grid-cols-[minmax(9rem,1fr)_6.5rem_7.5rem_7.5rem_7rem_6rem]"

function ScenarioComparisonRow({
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
        "grid w-full gap-4 px-3 py-2 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
        gridTemplate,
        selected ? "bg-primary/10" : "hover:bg-muted/25"
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{row.label}</div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {row.shockSummary}
        </div>
      </div>
      <TableValue value={formatUsd(row.estimatedSettlementPriceUsd, 0)} />
      <TableValue value={formatDusdc(row.estimatedLiability, 0)} />
      <TableValue value={formatDusdc(row.estimatedVaultValue, 0)} />
      <TableValue value={formatSharePrice(row.estimatedSharePrice)} />
      <TableValue
        className={getDrawdownClassName(row.drawdownPct)}
        value={formatPercent(row.drawdownPct)}
      />
    </button>
  )
}

export function ScenarioComparison({
  onScenarioChange,
  rows,
  selectedScenarioId,
}: {
  onScenarioChange: (scenarioId: RiskScenarioId) => void
  rows: RiskScenarioRow[]
  selectedScenarioId: RiskScenarioId
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border/40">
      <div className="overflow-auto">
        <div className="min-w-[48rem]">
          <div
            className={cn(
              "grid gap-4 border-b border-border/40 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground",
              gridTemplate
            )}
          >
            <span>Scenario</span>
            <span className="text-right">Settle</span>
            <span className="text-right">Liability</span>
            <span className="text-right">Strategy</span>
            <span className="text-right">PLP price</span>
            <span className="text-right">Drawdown</span>
          </div>
          <div className="divide-y divide-border/25">
            {rows.map((row) => (
              <ScenarioComparisonRow
                key={row.id}
                onSelect={() => onScenarioChange(row.id)}
                row={row}
                selected={row.id === selectedScenarioId}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
