import { QUOTE_QUANTITY as TOOLBAR_QUOTE_QUANTITY } from "@/lib/config"
import type {ExpiryOption, MarketSnapshot} from "@/lib/types/market";
import type {ToolbarQuote} from "@/lib/types/trade";
import { presentTradeMarkets } from "@/lib/trade-presenter"
import {
  getPredictOracles,
} from "@/services/predict-client"
import { quotePredictTradeSafe } from "@/services/predict-quotes"
import { loadActiveMarketSnapshots } from "@/lib/market-loaders"

const TOOLBAR_QUOTE_SENDER = "0x797"

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

export async function loadToolbarQuote({
  expiryMs,
  oracleId,
  selectedStrikePriceUsd,
}: {
  expiryMs: number
  oracleId: string
  selectedStrikePriceUsd: number
}): Promise<ToolbarQuote | null> {
  const quote = await quotePredictTradeSafe({
    expiryMs,
    isUp: true,
    kind: "binary",
    oracleId,
    quantity: TOOLBAR_QUOTE_QUANTITY,
    strikePriceUsd: selectedStrikePriceUsd,
    walletAddress: TOOLBAR_QUOTE_SENDER,
  })

  if (quote.status !== "quoted") {
    return null
  }

  const spread = quote.mintCost - quote.redeemPayout

  return {
    aboveAsk: Number(quote.mintCost),
    aboveBid: Number(quote.redeemPayout),
    spread: Number(spread > 0n ? spread : 0n),
  }
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
