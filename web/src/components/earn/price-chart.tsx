import { SharePriceChart } from "@/components/shared/share-price-chart"
import { formatSharePrice } from "@/lib/earn/format"
import type { VaultPerformanceResponse, VaultSummary } from "@/lib/types/predict"

export function VaultPriceChart({
  performance,
  summary,
}: {
  performance: VaultPerformanceResponse
  summary: VaultSummary
}) {
  return (
    <SharePriceChart
      currentPrice={`$${formatSharePrice(summary.plp_share_price)}`}
      gradientId="plpShareGradient"
      points={performance.points}
      title="PLP Price"
    />
  )
}
