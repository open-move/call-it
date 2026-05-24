import { formatRelativeTime, formatUsd } from "./format"
import {
  PredictionMarketKind,
  PredictionOutcome,
  type MarketPricePoint,
  type PredictionMarketCardData,
} from "./types"
import {
  type OraclePriceUpdate,
  type OracleStateResponse,
} from "~/lib/deepbook/predict-types"

const PRICE_SCALE = 1_000_000_000

const assetMetadata: Record<
  string,
  { assetName: string; assetIconUrl?: string }
> = {
  BTC: {
    assetName: "Bitcoin",
    assetIconUrl:
      "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png",
  },
}

const simpleDirectionalOutcomes = [
  { label: "Yes", value: PredictionOutcome.Yes },
  { label: "No", value: PredictionOutcome.No },
] satisfies PredictionMarketCardData["outcomes"]

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

function toUsdPrice(value: number) {
  return value / PRICE_SCALE
}

function deriveStrikePriceUsd(state: OracleStateResponse) {
  if (!state.latest_price) {
    throw new Error(`Missing latest price for oracle ${state.oracle.oracle_id}`)
  }

  const { min_strike, tick_size } = state.oracle
  const latestSpot = state.latest_price.spot
  const ticksFromMinimum = Math.max(
    0,
    Math.round((latestSpot - min_strike) / tick_size)
  )
  const strike = min_strike + ticksFromMinimum * tick_size

  return toUsdPrice(strike)
}

function getAssetMetadata(assetSymbol: string) {
  return (
    assetMetadata[assetSymbol] ?? {
      assetName: assetSymbol,
      assetIconUrl: undefined,
    }
  )
}

function getPriceChangePercent(priceHistory: MarketPricePoint[]) {
  const firstPoint = priceHistory[0]
  const lastPoint = priceHistory.at(-1)

  if (!firstPoint || !lastPoint || firstPoint.valueUsd === 0) {
    return 0
  }

  return (
    ((lastPoint.valueUsd - firstPoint.valueUsd) / firstPoint.valueUsd) * 100
  )
}

function mapPriceHistory(prices: OraclePriceUpdate[]): MarketPricePoint[] {
  return prices
    .slice()
    .reverse()
    .map((price) => ({
      label: formatRelativeTime(price.checkpoint_timestamp_ms),
      valueUsd: toUsdPrice(price.spot),
    }))
}

export function mapOracleStateToPredictionMarket(
  state: OracleStateResponse,
  prices: OraclePriceUpdate[] = []
): PredictionMarketCardData {
  if (!state.latest_price) {
    throw new Error(`Missing latest price for oracle ${state.oracle.oracle_id}`)
  }

  const assetSymbol = state.oracle.underlying_asset
  const metadata = getAssetMetadata(assetSymbol)
  const priceHistory = mapPriceHistory(prices)
  const currentPriceUsd = toUsdPrice(state.latest_price.spot)
  const strikePriceUsd = deriveStrikePriceUsd(state)
  const expiryLabel = formatExpiryTime(state.oracle.expiry)

  return {
    id: state.oracle.oracle_id,
    oracleId: state.oracle.oracle_id,
    assetSymbol,
    assetName: metadata.assetName,
    assetIconUrl: metadata.assetIconUrl,
    prompt: `Will ${assetSymbol} finish above ${formatUsd(strikePriceUsd, 0)} by ${expiryLabel}?`,
    durationLabel: formatTimeRemaining(state.oracle.expiry),
    currentPriceUsd,
    priceChangePercent: getPriceChangePercent(priceHistory),
    tradeCount: 0,
    statusLabel:
      state.oracle.status === "active" ? "Live" : state.oracle.status,
    priceUpdatedLabel: formatRelativeTime(
      state.latest_price.checkpoint_timestamp_ms
    ),
    expiryMs: state.oracle.expiry,
    strikePriceUsd,
    priceHistory,
    recentTrades: [],
    kind: PredictionMarketKind.Directional,
    outcomes: simpleDirectionalOutcomes,
  }
}
