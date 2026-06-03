import { type MarketSnapshot } from "~/lib/callit/market/types"

import { getQuoteableTradeStrike } from "./strikes"
import { type TradeMarket, type TradeMarketActivity } from "./types"

export async function presentTradeMarkets(
  snapshots: MarketSnapshot[],
  activityByOracleId: Map<string, TradeMarketActivity> = new Map()
): Promise<TradeMarket[]> {
  return Promise.all(
    snapshots.map(async (snapshot) => {
      const activity = activityByOracleId.get(snapshot.oracleId)

      return {
        id: snapshot.oracleId,
        oracleId: snapshot.oracleId,
        assetSymbol: snapshot.assetSymbol,
        assetName: snapshot.assetName,
        assetIconUrl: snapshot.assetIconUrl,
        currentPriceUsd: snapshot.currentPriceUsd,
        expiryMs: snapshot.expiryMs,
        fairUpProbability: snapshot.fairUpProbability,
        priceChangePercent: snapshot.priceChangePercent,
        priceHistory: snapshot.priceHistory,
        priceUpdatedMs: snapshot.priceUpdatedMs,
        status: snapshot.status,
        strikePriceUsd: await getQuoteableTradeStrike(snapshot),
        tradeCount: activity?.tradeCount ?? 0,
        volumeUsd: activity?.volumeUsd ?? 0,
      }
    })
  )
}
