import { ChevronDown } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { AssetIcon } from "~/components/shared/market/asset-icon"
import { formatUsd } from "~/lib/callit/format"
import { type MarketSnapshot } from "~/lib/callit/market/types"
import { cn } from "~/lib/utils"

import {
  formatExpiryDistance,
  formatSignedPercent,
  formatSignedUsd,
  getStrikeDistance,
} from "./utils"

export interface HeaderProps {
  market: MarketSnapshot
  selectedStrikePriceUsd: number
}

export function Header({ market, selectedStrikePriceUsd }: HeaderProps) {
  const distance = getStrikeDistance(market, selectedStrikePriceUsd)
  const distanceClassName = distance.isAboveStrike
    ? "text-outcome-up"
    : "text-outcome-down"
  const distanceValue = `${formatSignedUsd(distance.distanceUsd)} / ${formatSignedPercent(distance.distancePercent)}`

  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <div className="h-16 overflow-x-auto">
        <div className="flex h-16 min-w-[860px] items-center gap-7 px-3">
          <Button
            aria-label="Select market"
            className="h-9 max-w-[21rem] shrink-0 justify-start gap-2 overflow-hidden rounded-md px-2 text-left font-normal shadow-none ring-0 hover:bg-surface-muted/45 focus-visible:ring-0"
            type="button"
            variant="ghost"
          >
            <AssetIcon
              assetIconUrl={market.assetIconUrl}
              assetName={market.assetName}
              assetSymbol={market.assetSymbol}
              className="size-5"
            />

            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {market.assetSymbol} Above {formatUsd(selectedStrikePriceUsd, 0)}
            </span>

            <ChevronDown
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2.2}
            />
          </Button>

          <div className="flex shrink-0 items-center gap-7 font-medium tabular-nums">
            <ToolbarMetric
              label="Spot"
              value={formatUsd(market.currentPriceUsd, 0)}
            />
            <ToolbarMetric
              label="Strike"
              value={formatUsd(selectedStrikePriceUsd, 0)}
            />
            <ToolbarMetric label="Chance" value="--" />
            <ToolbarMetric label="Price (Yes)" value="--" />
            <ToolbarMetric
              className={distanceClassName}
              label="Distance"
              value={distanceValue}
            />
            <ToolbarMetric
              label="Expires"
              value={formatExpiryDistance(market.expiryMs)}
            />
          </div>
        </div>
      </div>
    </Card>
  )
}

function ToolbarMetric({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 whitespace-nowrap">
      <div className="inline-block text-xs leading-none font-medium text-muted-foreground underline decoration-dotted underline-offset-4">
        {label}
      </div>
      <div
        className={cn(
          "mt-2.5 truncate font-mono text-xs leading-none font-medium text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}
