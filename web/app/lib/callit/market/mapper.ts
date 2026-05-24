import {
  type MarketPricePoint,
  type MarketSnapshot,
} from "~/lib/callit/market/types"
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
      timestampMs: price.checkpoint_timestamp_ms,
      valueUsd: toUsdPrice(price.spot),
    }))
}

export function mapOracleStateToMarketSnapshot(
  state: OracleStateResponse,
  prices: OraclePriceUpdate[] = []
): MarketSnapshot {
  if (!state.latest_price) {
    throw new Error(`Missing latest price for oracle ${state.oracle.oracle_id}`)
  }

  const assetSymbol = state.oracle.underlying_asset
  const metadata = getAssetMetadata(assetSymbol)
  const priceHistory = mapPriceHistory(prices)

  return {
    id: state.oracle.oracle_id,
    oracleId: state.oracle.oracle_id,
    assetSymbol,
    assetName: metadata.assetName,
    assetIconUrl: metadata.assetIconUrl,
    currentPriceUsd: toUsdPrice(state.latest_price.spot),
    expiryMs: state.oracle.expiry,
    minStrikeUsd: toUsdPrice(state.oracle.min_strike),
    priceChangePercent: getPriceChangePercent(priceHistory),
    priceHistory,
    priceUpdatedMs: state.latest_price.checkpoint_timestamp_ms,
    recentTrades: [],
    status: state.oracle.status,
    strikePriceUsd: deriveStrikePriceUsd(state),
    tickSizeUsd: toUsdPrice(state.oracle.tick_size),
  }
}
