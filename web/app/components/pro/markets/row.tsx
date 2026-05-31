import { Link } from "react-router"

import { Badge, BadgeTone } from "~/components/primitives/badge"
import { AssetIcon } from "~/components/shared/market/asset-icon"
import { formatRelativeTime, formatUsd } from "~/lib/callit/format"
import { type ProMarket } from "~/lib/callit/pro/types"
import { cn } from "~/lib/utils"

export interface RowProps {
  market: ProMarket
}

const expiryTimeFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
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

function getStatusLabel(status: string) {
  return status === "active" ? "Live" : status
}

function getStatusTone(status: string) {
  return status === "active" ? BadgeTone.Live : BadgeTone.Neutral
}

function getDistance(market: ProMarket) {
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

export function Row({ market }: RowProps) {
  const distance = getDistance(market)
  const isAboveStrike = distance.distanceUsd >= 0
  const statusLabel = getStatusLabel(market.status)
  const statusTone = getStatusTone(market.status)

  return (
    <Link
      aria-label={`Open pro ${market.assetName} market`}
      className="group block border-b border-l-2 border-b-border/25 border-l-transparent transition-colors last:border-b-0 hover:bg-accent/35 focus-visible:bg-accent/35 focus-visible:outline-none"
      to={`/pro/markets/${market.oracleId}?strike=${market.strikePriceUsd}`}
    >
      <div className="grid gap-2 px-3 py-3 sm:px-4 lg:grid-cols-[minmax(15rem,1.45fr)_0.8fr_0.8fr_0.95fr_0.9fr_0.75fr] lg:items-center lg:gap-0 lg:py-2.5">
        <div className="flex min-w-0 items-center justify-between gap-3 lg:justify-start">
          <div className="flex min-w-0 items-center gap-2.5">
            <AssetIcon
              assetIconUrl={market.assetIconUrl}
              assetName={market.assetName}
              assetSymbol={market.assetSymbol}
              className="size-6 lg:size-5"
            />
            <div className="min-w-0">
              <div className="truncate text-sm leading-5 font-semibold text-foreground">
                {market.assetSymbol} Above {formatUsd(market.strikePriceUsd, 0)}
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                Oracle market
              </div>
            </div>
          </div>
          <Badge className="lg:hidden" tone={statusTone}>
            {statusLabel}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4 lg:contents">
          <Metric label="Spot" value={formatUsd(market.currentPriceUsd, 0)} />
          <Metric label="Strike" value={formatUsd(market.strikePriceUsd, 0)} />
          <Metric
            className={isAboveStrike ? "text-outcome-up" : "text-outcome-down"}
            label="Distance"
            subValue={formatSignedPercent(distance.distancePercent)}
            value={formatSignedUsd(distance.distanceUsd)}
          />
          <Metric
            label="Expiry"
            subValue={formatExpiryTime(market.expiryMs)}
            value={formatExpiryDistance(market.expiryMs)}
          />
          <Metric
            label="Updated"
            value={formatRelativeTime(market.priceUpdatedMs)}
          />
        </div>
      </div>
    </Link>
  )
}

function Metric({
  className,
  label,
  subValue,
  value,
}: {
  className?: string
  label: string
  subValue?: string
  value: string
}) {
  return (
    <div className="min-w-0 lg:block">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:hidden">
        {label}
      </div>
      <div
        className={cn(
          "truncate font-mono text-sm font-medium text-foreground tabular-nums lg:border-l lg:border-border/20 lg:pl-4 lg:text-right",
          className
        )}
      >
        {value}
      </div>
      {subValue && (
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase lg:border-l lg:border-border/20 lg:pl-4 lg:text-right">
          {subValue}
        </div>
      )}
    </div>
  )
}
