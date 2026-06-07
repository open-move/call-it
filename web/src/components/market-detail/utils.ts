import { formatRelativeTime, formatUsd } from "@/lib/callit/format"
import { type MarketSnapshot } from "@/lib/callit/market/types"

export interface StrikeDistance {
  distancePercent: number
  distanceUsd: number
  isAboveStrike: boolean
}

const expiryFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
})

const marketTitleExpiryFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
})

export function getStrikeDistance(
  market: MarketSnapshot,
  selectedStrikePriceUsd: number
): StrikeDistance {
  const distanceUsd = market.currentPriceUsd - selectedStrikePriceUsd
  const distancePercent =
    selectedStrikePriceUsd === 0
      ? 0
      : (distanceUsd / selectedStrikePriceUsd) * 100

  return {
    distancePercent,
    distanceUsd,
    isAboveStrike: distanceUsd >= 0,
  }
}

export function formatExpiry(expiryMs: number) {
  return expiryFormatter.format(new Date(expiryMs))
}

export function formatMarketTitleExpiry(expiryMs: number) {
  return marketTitleExpiryFormatter.format(new Date(expiryMs))
}

export function formatExpiryDistance(expiryMs: number, nowMs = Date.now()) {
  const remainingMs = expiryMs - nowMs

  if (remainingMs <= 0) {
    return "Expired"
  }

  const totalSeconds = Math.round(remainingMs / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes < 60) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours < 48) {
    return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}m`
  }

  return `${Math.round(hours / 24)}d`
}

export function formatSignedUsd(value: number) {
  const displayValue = Math.abs(value) < 0.5 ? 0 : value

  return `${displayValue >= 0 ? "+" : ""}${formatUsd(displayValue, 0)}`
}

export function formatSignedPercent(value: number) {
  const displayValue = Math.abs(value) < 0.005 ? 0 : value

  return `${displayValue >= 0 ? "+" : ""}${displayValue.toFixed(2)}%`
}

export function formatStatus(status: string) {
  return status === "active" ? "Live" : status
}

export function formatUpdated(timestampMs: number) {
  return formatRelativeTime(timestampMs)
}
