import { Link } from "@tanstack/react-router"

import { AssetIcon } from "@/components/shared/market/asset-icon"
import { Button } from "@/components/ui/button"
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
import type {TradeMarket} from "@/lib/types/trade";
import { cn } from "@/lib/utils"

import { Sparkline } from "./sparkline"

export interface RowProps {
  market: TradeMarket
}

function getDistance(market: TradeMarket) {
  const distanceUsd = market.currentPriceUsd - market.strikePriceUsd
  const distancePercent =
    market.strikePriceUsd === 0
      ? 0
      : (distanceUsd / market.strikePriceUsd) * 100

  return { distancePercent, distanceUsd }
}

function getMarketHref(market: TradeMarket) {
  const searchParams = new URLSearchParams({
    strike: market.strikePriceUsd.toString(),
  })

  return `/markets/${market.oracleId}?${searchParams.toString()}`
}

export function Row({ market }: RowProps) {
  const distance = getDistance(market)
  const isAboveStrike = distance.distanceUsd >= 0
  const priceChangedUp = market.priceChangePercent >= 0

  return (
    <div className="lg:border-b lg:border-border/35 lg:last:border-b-0">
      {/* Desktop row */}
      <Link
        aria-label={`Open ${market.assetName} market`}
        className="hidden min-h-14 px-3 py-2 transition-colors hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none lg:grid lg:grid-cols-[minmax(15rem,1.5fr)_7rem_0.6fr_0.7fr_0.75fr_0.75fr_7rem] lg:items-center"
        to={getMarketHref(market)}
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
            <div className="truncate text-xs text-foreground">
              {market.assetSymbol} Prediction ·{" "}
              {formatMarketTitleExpiry(market.expiryMs)}
            </div>
            <div className="mt-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">
              Spot {formatUsd(market.currentPriceUsd, 0)}
            </div>
          </div>
        </div>

        {/* Column 2: Sparkline (no header label) */}
        <div className="border-l border-border/25 pl-3">
          <Sparkline className="h-6" points={market.priceHistory} />
        </div>

        {/* Column 3: Prob. */}
        <div className="border-l border-border/25 pl-3 text-right font-mono tabular-nums">
          <div
            className={cn(
              "text-xs font-medium text-foreground",
              priceChangedUp ? "text-outcome-up" : "text-outcome-down"
            )}
          >
            {formatProbability(market.fairUpProbability)}
          </div>
          <div
            className={cn(
              "mt-0.5 text-[10px] uppercase",
              priceChangedUp ? "text-outcome-up" : "text-outcome-down"
            )}
          >
            {priceChangedUp ? "+" : ""}
            {market.priceChangePercent.toFixed(2)}%
          </div>
        </div>

        {/* Column 4: Volume */}
        <div className="border-l border-border/25 pl-3 text-right font-mono tabular-nums">
          <div className="text-xs font-medium text-foreground">
            {formatCompactUsd(market.volumeUsd)}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground uppercase">
            {market.tradeCount} txns
          </div>
        </div>

        {/* Column 5: Distance */}
        <div className="border-l border-border/25 pl-3 text-right font-mono tabular-nums">
          <div
            className={cn(
              "text-xs font-medium text-foreground",
              isAboveStrike ? "text-outcome-up" : "text-outcome-down"
            )}
          >
            {formatSignedUsd(distance.distanceUsd)}
          </div>
          <div
            className={cn(
              "mt-0.5 text-[10px] uppercase",
              isAboveStrike ? "text-outcome-up" : "text-outcome-down"
            )}
          >
            {formatSignedPercent(distance.distancePercent)}
          </div>
        </div>

        {/* Column 6: Expires */}
        <div className="border-l border-border/25 pl-3 text-right font-mono tabular-nums">
          <div className="text-xs font-medium text-foreground">
            {formatExpiryDistance(market.expiryMs)}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground uppercase">
            {formatExpiryTime(market.expiryMs)}
          </div>
        </div>

        {/* Column 7: Action */}
        <div className="flex items-center justify-end lg:border-l lg:border-border/25 lg:pl-3">
          <span className="inline-flex h-8 min-w-[4.5rem] items-center justify-center rounded-md border border-border/50 bg-background px-3 text-xs font-medium text-foreground shadow-xs">
            Trade
          </span>
        </div>
      </Link>

      {/* Mobile card */}
      <Link
        aria-label={`Open ${market.assetName} market`}
        className="block space-y-2 rounded-md bg-card p-3 transition-colors hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none lg:hidden"
        to={getMarketHref(market)}
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
              <div className="truncate text-xs text-foreground">
                {market.assetSymbol} Prediction ·{" "}
                {formatMarketTitleExpiry(market.expiryMs)}
              </div>
              <div className="mt-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                Spot {formatUsd(market.currentPriceUsd, 0)}
              </div>
            </div>
          </div>
          <div className="text-right text-xs font-medium text-foreground tabular-nums">
            {formatProbability(market.fairUpProbability)}
          </div>
        </div>

        <Sparkline className="h-6" points={market.priceHistory} />

        <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
          <MobileMetric
            label="Volume"
            value={formatCompactUsd(market.volumeUsd)}
          />
          <MobileMetric
            className={isAboveStrike ? "text-outcome-up" : "text-outcome-down"}
            label="Distance"
            value={formatSignedUsd(distance.distanceUsd)}
          />
          <MobileMetric
            label="Expires"
            value={formatExpiryDistance(market.expiryMs)}
          />
          <MobileMetric
            label="Updated"
            value={formatRelativeTime(market.priceUpdatedMs)}
          />
        </div>

        <span className="inline-flex w-full items-center justify-center rounded-md border border-border/50 bg-background px-3 py-2 text-xs font-medium text-foreground shadow-xs">
          Trade
        </span>
      </Link>
    </div>
  )
}

function MobileMetric({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-xs font-medium text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}
