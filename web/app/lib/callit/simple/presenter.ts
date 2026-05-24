import { formatRelativeTime, formatUsd } from "~/lib/callit/format"
import { type MarketSnapshot } from "~/lib/callit/market/types"

import {
  PredictionMarketKind,
  PredictionOutcome,
  type SimpleMarket,
} from "./types"

const simpleDirectionalOutcomes = [
  { label: "Yes", value: PredictionOutcome.Yes },
  { label: "No", value: PredictionOutcome.No },
] satisfies SimpleMarket["outcomes"]

function formatExpiryTime(expiryMs: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(expiryMs))
}

function formatTimeRemaining(expiryMs: number, nowMs = Date.now()) {
  const remainingMs = expiryMs - nowMs

  if (remainingMs <= 0) {
    return "Ending now"
  }

  const minutes = Math.round(remainingMs / 60_000)

  if (minutes < 60) {
    return `${minutes}m left`
  }

  const hours = Math.round(minutes / 60)

  if (hours < 48) {
    return `${hours}h left`
  }

  const days = Math.round(hours / 24)
  return `${days}d left`
}

export function presentSimpleMarket(snapshot: MarketSnapshot): SimpleMarket {
  const expiryLabel = formatExpiryTime(snapshot.expiryMs)

  return {
    ...snapshot,
    durationLabel: formatTimeRemaining(snapshot.expiryMs),
    expiryLabel,
    kind: PredictionMarketKind.Directional,
    outcomes: simpleDirectionalOutcomes,
    priceUpdatedLabel: formatRelativeTime(snapshot.priceUpdatedMs),
    prompt: `Will ${snapshot.assetSymbol} finish above ${formatUsd(snapshot.strikePriceUsd, 0)} by ${expiryLabel}?`,
    statusLabel: snapshot.status === "active" ? "Live" : snapshot.status,
  }
}
