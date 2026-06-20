import { formatPercent, formatUsd } from "@/lib/format"
import {
  formatDusdc,
  formatSharePrice,
  getDrawdownClassName,
} from "@/lib/risk/helpers"
import type { RiskScenarioRow } from "@/lib/risk/types"
import { TableValue } from "./table-value"

function ScenarioComparisonRow({ row }: { row: RiskScenarioRow }) {
  return (
    <div className="grid grid-cols-[minmax(9rem,1fr)_6.5rem_7.5rem_7.5rem_7rem_6rem] gap-4 border-b border-border/35 px-3 py-2 text-xs last:border-b-0">
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{row.label}</div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase">
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
    </div>
  )
}

export function ScenarioComparison({ rows }: { rows: RiskScenarioRow[] }) {
  return (
    <div className="border-t border-border/45">
      <div className="overflow-auto">
        <div className="min-w-[48rem]">
          <div className="grid grid-cols-[minmax(9rem,1fr)_6.5rem_7.5rem_7.5rem_7rem_6rem] gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            <span>Scenario</span>
            <span className="text-right">Settle</span>
            <span className="text-right">Liability</span>
            <span className="text-right">Strategy</span>
            <span className="text-right">PLP price</span>
            <span className="text-right">Drawdown</span>
          </div>
          {rows.map((row) => (
            <ScenarioComparisonRow key={row.id} row={row} />
          ))}
        </div>
      </div>
    </div>
  )
}
