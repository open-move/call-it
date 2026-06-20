import { Link } from "@tanstack/react-router"

import { AssetIcon } from "@/components/shared/market/asset-icon"
import {
  formatCompactUsd,
  formatExpiryDistance,
  formatExpiryTime,
  formatMarketTitleExpiry,
  formatProbability,
  formatRelativeTime,
  formatSignedPercent,
  formatSignedUsd,
  formatUsd,
} from "@/lib/format"
import { getDistance } from "@/lib/markets/helpers"
import type { TradeMarket } from "@/lib/types/trade"
import { cn } from "@/lib/utils"

import { Metric } from "./metric"
import { Sparkline } from "./sparkline"

export interface RowProps {
  market: TradeMarket
}

export function Row({ market }: RowProps) {
  const distance = getDistance(market)
  const isAboveStrike = distance.distanceUsd >= 0
  const priceChangedUp = market.priceChangePercent >= 0

  return (
    <div className="lg:border-b lg:border-border/25 lg:last:border-b-0">
      {/* Desktop row */}
      <Link
        aria-label={`Open ${market.assetName} market`}
        className="group hidden min-h-[3.75rem] px-3 py-2.5 transition-[background-color,transform] duration-150 hover:bg-muted/25 active:scale-[0.997] focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none lg:grid lg:grid-cols-[minmax(15rem,1.5fr)_7rem_0.6fr_0.7fr_0.75fr_0.75fr_7rem] lg:items-center"
        params={{ oracleId: market.oracleId }}
        to="/markets/$oracleId"
      >
        {/* Column 1: Identity */}
        <div className="flex min-w-0 items-center gap-2.5">
          <AssetIcon
            assetIconUrl={market.assetIconUrl}
            assetName={market.assetName}
            assetSymbol={market.assetSymbol}
            className="size-6"
          />
          <div className="min-w-0">
            <div className="truncate text-sm leading-5 font-medium tracking-[-0.01em] text-foreground">
              {market.assetSymbol}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                Prediction · {formatMarketTitleExpiry(market.expiryMs)}
              </span>
            </div>
            <div className="text-[11px] leading-4 text-muted-foreground">
              Spot {formatUsd(market.currentPriceUsd, 0)}
            </div>
          </div>
        </div>

        {/* Column 2: Sparkline (no header label) */}
        <div className="border-l border-border/20 pl-3">
          <Sparkline className="h-7 opacity-90" points={market.priceHistory} />
        </div>

        {/* Column 3: Prob. */}
        <div className="border-l border-border/20 pl-3 text-right font-mono tabular-nums">
          <div
            className={cn(
              "text-sm leading-5 font-semibold text-foreground",
              priceChangedUp ? "text-outcome-up" : "text-outcome-down"
            )}
          >
            {formatProbability(market.fairUpProbability)}
          </div>
          <div
            className={cn(
              "text-[11px] leading-4",
              priceChangedUp ? "text-outcome-up" : "text-outcome-down"
            )}
          >
            {priceChangedUp ? "+" : ""}
            {market.priceChangePercent.toFixed(2)}%
          </div>
        </div>

        {/* Column 4: Volume */}
        <div className="border-l border-border/20 pl-3 text-right font-mono tabular-nums">
          <div className="text-xs leading-5 font-medium text-foreground">
            {formatCompactUsd(market.volumeUsd)}
          </div>
          <div className="text-[11px] leading-4 text-muted-foreground">
            {market.tradeCount} txns
          </div>
        </div>

        {/* Column 5: Distance */}
        <div className="border-l border-border/20 pl-3 text-right font-mono tabular-nums">
          <div
            className={cn(
              "text-xs leading-5 font-medium text-foreground",
              isAboveStrike ? "text-outcome-up" : "text-outcome-down"
            )}
          >
            {formatSignedUsd(distance.distanceUsd)}
          </div>
          <div
            className={cn(
              "text-[11px] leading-4",
              isAboveStrike ? "text-outcome-up" : "text-outcome-down"
            )}
          >
            {formatSignedPercent(distance.distancePercent)}
          </div>
        </div>

        {/* Column 6: Expires */}
        <div className="border-l border-border/20 pl-3 text-right font-mono tabular-nums">
          <div className="text-xs leading-5 font-medium text-foreground">
            {formatExpiryDistance(market.expiryMs)}
          </div>
          <div className="text-[11px] leading-4 text-muted-foreground">
            {formatExpiryTime(market.expiryMs)}
          </div>
        </div>

        {/* Column 7: Action */}
        <div className="flex items-center justify-end lg:border-l lg:border-border/20 lg:pl-3">
          <span className="inline-flex h-8 min-w-[4.5rem] items-center justify-center rounded-md border border-border/40 bg-muted/25 px-3 text-xs font-medium text-foreground shadow-xs transition-[background-color,border-color,color] duration-150 group-hover:border-primary/30 group-hover:bg-primary/8 group-hover:text-primary">
            Trade
          </span>
        </div>
      </Link>

      {/* Mobile card */}
      <Link
        aria-label={`Open ${market.assetName} market`}
        className="group block space-y-2 rounded-lg bg-card p-3 transition-[background-color,transform] duration-150 hover:bg-muted/25 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none lg:hidden"
        params={{ oracleId: market.oracleId }}
        to="/markets/$oracleId"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <AssetIcon
              assetIconUrl={market.assetIconUrl}
              assetName={market.assetName}
              assetSymbol={market.assetSymbol}
              className="size-6"
            />
            <div className="min-w-0">
              <div className="truncate text-sm leading-5 font-medium tracking-[-0.01em] text-foreground">
                {market.assetSymbol}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  Prediction · {formatMarketTitleExpiry(market.expiryMs)}
                </span>
              </div>
              <div className="text-[11px] leading-4 text-muted-foreground">
                Spot {formatUsd(market.currentPriceUsd, 0)}
              </div>
            </div>
          </div>
          <div className="text-right font-mono tabular-nums">
            <div
              className={cn(
                "text-sm leading-5 font-semibold text-foreground",
                priceChangedUp ? "text-outcome-up" : "text-outcome-down"
              )}
            >
              {formatProbability(market.fairUpProbability)}
            </div>
            <div
              className={cn(
                "text-[11px] leading-4",
                priceChangedUp ? "text-outcome-up" : "text-outcome-down"
              )}
            >
              {priceChangedUp ? "+" : ""}
              {market.priceChangePercent.toFixed(2)}%
            </div>
          </div>
        </div>

        <Sparkline className="h-7 opacity-90" points={market.priceHistory} />

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
          <Metric
            label="Volume"
            value={formatCompactUsd(market.volumeUsd)}
          />
          <Metric
            className={isAboveStrike ? "text-outcome-up" : "text-outcome-down"}
            label="Distance"
            value={formatSignedUsd(distance.distanceUsd)}
          />
          <Metric
            label="Expires"
            value={formatExpiryDistance(market.expiryMs)}
          />
          <Metric
            label="Updated"
            value={formatRelativeTime(market.priceUpdatedMs)}
          />
        </div>

        <span className="inline-flex w-full items-center justify-center rounded-md border border-border/40 bg-muted/25 px-3 py-2 text-xs font-medium text-foreground shadow-xs transition-[background-color,border-color,color] duration-150 group-hover:border-primary/30 group-hover:bg-primary/8 group-hover:text-primary">
          Trade
        </span>
      </Link>
    </div>
  )
}


