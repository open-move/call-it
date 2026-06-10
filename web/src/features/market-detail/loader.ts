import type {ExpiryOption, MarketSnapshot} from "@/lib/types/market";
import { presentTradeMarkets } from "@/lib/trade-presenter"
import {
  getPredictOracles,
} from "@/services/predict-client"
import { loadActiveMarketSnapshots } from "@/lib/market-loaders"

export async function loadExpiryOptions(
  market: MarketSnapshot
): Promise<ExpiryOption[]> {
  const oracles = await getPredictOracles()

  return oracles
    .filter((oracle) => {
      return (
        oracle.underlying_asset === market.assetSymbol &&
        (oracle.status === "active" || oracle.oracle_id === market.oracleId)
      )
    })
    .sort(
      (firstOracle, secondOracle) => firstOracle.expiry - secondOracle.expiry
    )
    .map((oracle) => ({
      assetSymbol: oracle.underlying_asset,
      expiryMs: oracle.expiry,
      oracleId: oracle.oracle_id,
      status: oracle.status,
    }))
}

export async function loadMarketOptions(market: MarketSnapshot) {
  const activeMarkets = await loadActiveMarketSnapshots()
  const hasCurrentMarket = activeMarkets.some(
    (activeMarket) => activeMarket.oracleId === market.oracleId
  )
  const marketSnapshots = hasCurrentMarket
    ? activeMarkets
    : [...activeMarkets, market]

  return presentTradeMarkets(marketSnapshots)
}
