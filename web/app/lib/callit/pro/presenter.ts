import { type MarketSnapshot } from "~/lib/callit/market/types"

import { type ProMarket } from "./types"

export function presentProMarkets(snapshots: MarketSnapshot[]): ProMarket[] {
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
    ladderOffset: 0,
  }))
}
