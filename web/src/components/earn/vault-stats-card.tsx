import { AllocationBar } from "@/components/primitives/allocation-bar"
import type { AllocationSegment } from "@/components/primitives/allocation-bar"
import { DataRow } from "@/components/primitives/data-row"
import { getDisplayChartPoints } from "@/lib/earn/chart"
import { formatPercent, formatQuoteAmount, formatQuoteUsd, formatSharePrice } from "@/lib/earn/format"
import { annualizedReturn, apyWindowLabel } from "@/lib/perf/annualize"
import type { VaultPerformanceResponse, VaultSummary } from "@/lib/types/predict"

function utilizationSegments(summary: VaultSummary): AllocationSegment[] {
  const used = Math.min(1, Math.max(0, summary.utilization))

  return [
    { label: "Deployed", pct: used, tone: "primary" },
    { label: "Available", pct: 1 - used, tone: "muted" },
  ]
}

export function VaultStatsCard({
  performance,
  summary,
}: {
  performance: VaultPerformanceResponse
  summary: VaultSummary
}) {
  const annualized = annualizedReturn(getDisplayChartPoints(performance.points).points)

  return (
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
        Overview
      </h2>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">NAV</div>
          <div className="mt-1 truncate font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
            {formatQuoteUsd(summary.vault_value)}
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-xs text-muted-foreground">PLP price</div>
          <div className="mt-1 truncate font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
            ${formatSharePrice(summary.plp_share_price)}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <AllocationBar label="Utilization" segments={utilizationSegments(summary)} />
      </div>

      <div className="mt-5">
        <DataRow
          label={apyWindowLabel(annualized?.windowDays)}
          value={annualized === null ? "—" : formatPercent(annualized.apy)}
        />
        <DataRow
          label="Withdrawable"
          value={formatQuoteUsd(summary.available_withdrawal)}
        />
        <DataRow
          label="PLP supply"
          value={formatQuoteAmount(summary.plp_total_supply, "PLP")}
        />
      </div>
    </div>
  )
}
