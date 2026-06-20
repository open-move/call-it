import { AllocationBar } from "@/components/primitives/allocation-bar"
import type { AllocationSegment } from "@/components/primitives/allocation-bar"
import { DataRow } from "@/components/primitives/data-row"
import { formatQuoteAmount, formatSharePrice } from "@/lib/earn/format"
import type {
  VaultPerformanceResponse,
  VaultSummary,
} from "@/lib/types/predict"
import { VaultPriceChart } from "./price-chart"

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
  return (
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
        Strategy
      </h2>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">NAV</div>
          <div className="mt-1 truncate font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
            {formatQuoteAmount(summary.vault_value)}
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-xs text-muted-foreground">PLP price</div>
          <div className="mt-1 truncate font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
            {formatSharePrice(summary.plp_share_price)}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <AllocationBar label="Utilization" segments={utilizationSegments(summary)} />
      </div>

      <div className="mt-5">
        <DataRow
          label="Withdrawable"
          value={formatQuoteAmount(summary.available_withdrawal)}
        />
        <DataRow
          label="PLP supply"
          value={formatQuoteAmount(summary.plp_total_supply, "PLP")}
        />
      </div>

      <div className="mt-7">
        <VaultPriceChart performance={performance} summary={summary} />
      </div>
    </div>
  )
}
