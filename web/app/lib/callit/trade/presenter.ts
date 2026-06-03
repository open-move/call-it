import { type MarketSnapshot } from "~/lib/callit/market/types"

import { getQuoteableTradeStrike } from "./strikes"
import { type TradeMarket } from "./types"

export async function presentTradeMarkets(
  snapshots: MarketSnapshot[]
): Promise<TradeMarket[]> {
  return Promise.all(
    snapshots.map(async (snapshot) => ({
      id: snapshot.oracleId,
      oracleId: snapshot.oracleId,
      assetSymbol: snapshot.assetSymbol,
      assetName: snapshot.assetName,
      assetIconUrl: snapshot.assetIconUrl,
      currentPriceUsd: snapshot.currentPriceUsd,
      expiryMs: snapshot.expiryMs,
      priceUpdatedMs: snapshot.priceUpdatedMs,
      status: snapshot.status,
      strikePriceUsd: await getQuoteableTradeStrike(snapshot),
    }))
  )
}
