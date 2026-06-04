import { ChartPanel as SharedChartPanel } from "~/components/shared/detail/chart-panel"
import { type MarketPricePoint } from "~/lib/callit/market/types"

export interface ChartPanelProps {
  assetName: string
  assetSymbol: string
  oracleId: string
  points: MarketPricePoint[]
  selectedStrikePriceUsd: number
}

export function ChartPanel({ points, selectedStrikePriceUsd }: ChartPanelProps) {
  return (
    <SharedChartPanel
      points={points}
      referenceLabel="Strike"
      referencePriceUsd={selectedStrikePriceUsd}
    />
  )
}
