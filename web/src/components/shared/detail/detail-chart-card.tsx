import { type ReactNode } from "react"

import { type BadgeTone } from "@/components/primitives/badge"
import { Card } from "@/components/ui/card"
import {
  type ExpiryOption,
  type MarketPricePoint,
} from "@/lib/callit/market/types"

import { ChartPanel } from "./chart-panel"
import { DetailExpiryStrip } from "./detail-expiry-strip"
import { DetailHeader, type DetailMetric } from "./detail-header"

export interface DetailChartCardProps {
  assetIconUrl?: string
  assetName: string
  assetSymbol: string
  badgeLabel: string
  badgeTone: BadgeTone
  expiryOptions: ExpiryOption[]
  getExpiryHref: (option: ExpiryOption) => string
  identity?: ReactNode
  metrics: DetailMetric[]
  points: MarketPricePoint[]
  referenceLabel: string
  referencePriceUsd: number
  selectedOracleId: string
  title: ReactNode
}

export function DetailChartCard({
  assetIconUrl,
  assetName,
  assetSymbol,
  badgeLabel,
  badgeTone,
  expiryOptions,
  getExpiryHref,
  identity,
  metrics,
  points,
  referenceLabel,
  referencePriceUsd,
  selectedOracleId,
  title,
}: DetailChartCardProps) {
  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <DetailHeader
        assetIconUrl={assetIconUrl}
        assetName={assetName}
        assetSymbol={assetSymbol}
        badgeLabel={badgeLabel}
        badgeTone={badgeTone}
        identity={identity}
        metrics={metrics}
        title={title}
      />

      <DetailExpiryStrip
        expiryOptions={expiryOptions}
        getHref={getExpiryHref}
        selectedOracleId={selectedOracleId}
      />

      <ChartPanel
        points={points}
        referenceLabel={referenceLabel}
        referencePriceUsd={referencePriceUsd}
      />
    </Card>
  )
}
