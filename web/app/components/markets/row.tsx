import { Link } from "react-router"

import { AssetIcon } from "~/components/shared/market/asset-icon"
import { formatRelativeTime, formatUsd } from "~/lib/callit/format"
import { type TradeMarket } from "~/lib/callit/trade/types"
import { cn } from "~/lib/utils"

import { formatMarketTitleExpiry } from "../market-detail/utils"
import { Sparkline } from "./sparkline"

export interface RowProps {
  market: TradeMarket
}

const expiryTimeFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
})

function formatExpiryDistance(expiryMs: number, nowMs = Date.now()) {
  const remainingMs = expiryMs - nowMs

  if (remainingMs <= 0) {
    return "Expired"
  }

  const minutes = Math.round(remainingMs / 60_000)

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.round(minutes / 60)

  if (hours < 48) {
    return `${hours}h`
  }

  return `${Math.round(hours / 24)}d`
}

function formatExpiryTime(expiryMs: number) {
  return expiryTimeFormatter.format(new Date(expiryMs))
}

function getDistance(market: TradeMarket) {
  const distanceUsd = market.currentPriceUsd - market.strikePriceUsd
  const distancePercent =
    market.strikePriceUsd === 0
      ? 0
      : (distanceUsd / market.strikePriceUsd) * 100

  return { distancePercent, distanceUsd }
}

function formatSignedUsd(value: number) {
  const displayValue = Math.abs(value) < 0.5 ? 0 : value

  return `${displayValue >= 0 ? "+" : ""}${formatUsd(displayValue, 0)}`
}

function formatSignedPercent(value: number) {
  const displayValue = Math.abs(value) < 0.005 ? 0 : value

  return `${displayValue >= 0 ? "+" : ""}${displayValue.toFixed(2)}%`
}

function formatCompactUsd(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`
  }

  return formatUsd(value, 0)
}

function formatFairUpProbability(value: number | undefined) {
  return value === undefined ? "--" : `${Math.round(value * 100)}%`
}

function getMarketHref(market: TradeMarket, side?: "up" | "down") {
  const searchParams = new URLSearchParams({
    strike: market.strikePriceUsd.toString(),
  })

  if (side) {
    searchParams.set("side", side)
  }

  return `/markets/${market.oracleId}?${searchParams.toString()}`
}

export function Row({ market }: RowProps) {
  const distance = getDistance(market)
  const isAboveStrike = distance.distanceUsd >= 0
  const priceChangedUp = market.priceChangePercent >= 0

  return (
    <div className="border-b border-border/35 last:border-b-0">
      <div className="hidden min-h-14 px-3 py-2 transition-colors hover:bg-accent/25 lg:grid lg:grid-cols-[minmax(15rem,1.5fr)_7rem_0.6fr_0.7fr_0.75fr_0.75fr_7rem] lg:items-center">
        <MarketIdentity market={market} />
        <div className="border-l border-border/25 pl-3">
          <Sparkline className="h-6" points={market.priceHistory} />
        </div>
        <Metric
          className="text-outcome-up"
          subValue={`${priceChangedUp ? "+" : ""}${market.priceChangePercent.toFixed(2)}%`}
          subValueClassName={
            priceChangedUp ? "text-outcome-up" : "text-outcome-down"
          }
          value={formatFairUpProbability(market.fairUpProbability)}
        />
        <Metric
          subValue={`${market.tradeCount} txns`}
          value={formatCompactUsd(market.volumeUsd)}
        />
        <Metric
          className={isAboveStrike ? "text-outcome-up" : "text-outcome-down"}
          subValue={formatSignedPercent(distance.distancePercent)}
          value={formatSignedUsd(distance.distanceUsd)}
        />
        <Metric
          subValue={formatExpiryTime(market.expiryMs)}
          value={formatExpiryDistance(market.expiryMs)}
        />
        <ActionButtons market={market} />
      </div>

      <div className="space-y-2 px-3 py-2 lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <MarketIdentity market={market} />
          <div className="text-right font-mono text-xs font-medium text-outcome-up tabular-nums">
            {formatFairUpProbability(market.fairUpProbability)}
          </div>
        </div>
        <Sparkline points={market.priceHistory} />
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
        <ActionButtons market={market} />
      </div>
    </div>
  )
}

function MarketIdentity({ market }: { market: TradeMarket }) {
  return (
    <Link
      aria-label={`Open ${market.assetName} market`}
      className="group flex min-w-0 items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      to={getMarketHref(market)}
    >
      <AssetIcon
        assetIconUrl={market.assetIconUrl}
        assetName={market.assetName}
        assetSymbol={market.assetSymbol}
        className="size-6"
      />
      <div className="min-w-0">
        <div className="truncate text-xs text-foreground group-hover:text-primary">
          {market.assetSymbol} Prediction ·{" "}
          {formatMarketTitleExpiry(market.expiryMs)}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          <span>Spot {formatUsd(market.currentPriceUsd, 0)}</span>
        </div>
      </div>
    </Link>
  )
}

function Metric({
  className,
  subValue,
  subValueClassName,
  value,
}: {
  className?: string
  subValue?: string
  subValueClassName?: string
  value: string
}) {
  return (
    <div className="border-l border-border/25 pl-3 text-right font-mono tabular-nums">
      <div className={cn("text-xs font-medium text-foreground", className)}>
        {value}
      </div>
      {subValue && (
        <div
          className={cn(
            "mt-0.5 text-[10px] text-muted-foreground uppercase",
            subValueClassName
          )}
        >
          {subValue}
        </div>
      )}
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
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-mono text-xs font-medium text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}

function ActionButtons({ market }: { market: TradeMarket }) {
  return (
    <div className="flex items-center justify-end gap-1.5 lg:border-l lg:border-border/25 lg:pl-3">
      <Link
        className="inline-flex h-7 min-w-11 items-center justify-center rounded-md bg-outcome-up/10 px-2.5 text-xs font-medium text-outcome-up transition-colors hover:bg-outcome-up/15 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        to={getMarketHref(market, "up")}
      >
        Up
      </Link>
      <Link
        className="inline-flex h-7 min-w-11 items-center justify-center rounded-md bg-outcome-down/10 px-2.5 text-xs font-medium text-outcome-down transition-colors hover:bg-outcome-down/15 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        to={getMarketHref(market, "down")}
      >
        Down
      </Link>
    </div>
  )
}
