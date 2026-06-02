import { Badge, BadgeTone } from "~/components/primitives/badge"
import { AssetIcon } from "~/components/shared/market/asset-icon"
import { formatUsd } from "~/lib/callit/format"
import { type MarketSnapshot } from "~/lib/callit/market/types"
import { type ToolbarQuote } from "~/lib/callit/trade/types"
import { formatUnitPrice } from "~/lib/callit/trading/amounts"
import { PREDICT_QUOTE_DECIMALS } from "~/lib/deepbook/config"
import { cn } from "~/lib/utils"

import { formatExpiryDistance, formatMarketTitleExpiry } from "./utils"

export interface HeaderProps {
  market: MarketSnapshot
  selectedStrikePriceUsd: number
  toolbarQuote: ToolbarQuote | null
}

const TOOLBAR_QUOTE_QUANTITY = 10n ** BigInt(PREDICT_QUOTE_DECIMALS)

function formatToolbarPrice(value: number | undefined) {
  return value === undefined
    ? "--"
    : formatUnitPrice(BigInt(value), TOOLBAR_QUOTE_QUANTITY)
}

function getStatusLabel(status: string) {
  return status === "active" ? "Live" : status
}

function getStatusTone(status: string) {
  return status === "active" ? BadgeTone.Live : BadgeTone.Neutral
}

export function Header({
  market,
  selectedStrikePriceUsd,
  toolbarQuote,
}: HeaderProps) {
  const quoteValue = formatToolbarPrice(toolbarQuote?.aboveAsk)
  const spreadValue = formatToolbarPrice(toolbarQuote?.spread)

  return (
    <header className="border-b border-border/40">
      <div className="flex min-w-0 flex-col gap-3 px-3 py-2.5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <AssetIcon
              assetIconUrl={market.assetIconUrl}
              assetName={market.assetName}
              assetSymbol={market.assetSymbol}
              className="size-5"
            />
            <div className="flex min-w-0 items-center gap-1.5 text-left">
              <span className="truncate text-sm leading-none font-medium tracking-tight text-foreground">
                {market.assetSymbol} Prediction ·{" "}
                {formatMarketTitleExpiry(market.expiryMs)}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge
              className="px-2 py-0.5 font-mono text-[10px] uppercase"
              tone={getStatusTone(market.status)}
            >
              {getStatusLabel(market.status)}
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-150 items-end gap-6">
            <HeaderMetric label="Price (Up)" value={quoteValue} />
            <HeaderMetric label="Spread" value={spreadValue} />
            <HeaderMetric
              label="Spot"
              value={formatUsd(market.currentPriceUsd, 0)}
            />
            <HeaderMetric
              label="Selected Strike"
              value={formatUsd(selectedStrikePriceUsd, 0)}
            />
            <HeaderMetric
              label="Expires"
              value={formatExpiryDistance(market.expiryMs)}
            />
          </div>
        </div>
      </div>
    </header>
  )
}

function HeaderMetric({
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
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-xs leading-none font-medium text-foreground tabular-nums",
          value === "--" && "text-muted-foreground",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}
