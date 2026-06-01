import { type MarketSnapshot } from "~/lib/callit/market/types"

import { type TradeMarket } from "./types"

export function presentTradeMarkets(
  snapshots: MarketSnapshot[]
): TradeMarket[] {
  return snapshots.map((snapshot) => ({
    id: snapshot.oracleId,
    oracleId: snapshot.oracleId,
    assetSymbol: snapshot.assetSymbol,
    assetName: snapshot.assetName,
    assetIconUrl: snapshot.assetIconUrl,
    currentPriceUsd: snapshot.currentPriceUsd,
    expiryMs: snapshot.expiryMs,
    priceUpdatedMs: snapshot.priceUpdatedMs,
    status: snapshot.status,
    strikePriceUsd: snapshot.strikePriceUsd,
  }))
}
