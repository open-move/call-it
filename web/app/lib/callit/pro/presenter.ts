import { type MarketSnapshot } from "~/lib/callit/market/types"

import { type ProMarket } from "./types"

const STRIKE_OFFSETS = [-3, -2, -1, 0, 1, 2, 3] as const

function getMinimumVisibleStrikeStepUsd(currentPriceUsd: number) {
  if (currentPriceUsd >= 50_000) {
    return 500
  }

  if (currentPriceUsd >= 10_000) {
    return 100
  }

  if (currentPriceUsd >= 1_000) {
    return 50
  }

  if (currentPriceUsd >= 100) {
    return 5
  }

  if (currentPriceUsd >= 10) {
    return 1
  }

  return 0.1
}

function getStrikeStepUsd(snapshot: MarketSnapshot) {
  const minimumVisibleStepUsd = getMinimumVisibleStrikeStepUsd(
    snapshot.currentPriceUsd
  )

  if (snapshot.tickSizeUsd <= 0) {
    return minimumVisibleStepUsd
  }

  return (
    Math.ceil(minimumVisibleStepUsd / snapshot.tickSizeUsd) *
    snapshot.tickSizeUsd
  )
}

function getStrikePrice(snapshot: MarketSnapshot, offset: number) {
  const strikePriceUsd =
    snapshot.strikePriceUsd + offset * getStrikeStepUsd(snapshot)

  return Math.max(snapshot.minStrikeUsd, strikePriceUsd)
}

export function presentProMarkets(snapshots: MarketSnapshot[]): ProMarket[] {
  return snapshots.flatMap((snapshot) => {
    const usedStrikes = new Set<number>()

    return STRIKE_OFFSETS.flatMap((offset) => {
      const strikePriceUsd = getStrikePrice(snapshot, offset)

      if (usedStrikes.has(strikePriceUsd)) {
        return []
      }

      usedStrikes.add(strikePriceUsd)

      return {
        id: `${snapshot.oracleId}:${strikePriceUsd}`,
        oracleId: snapshot.oracleId,
        assetSymbol: snapshot.assetSymbol,
        assetName: snapshot.assetName,
        assetIconUrl: snapshot.assetIconUrl,
        currentPriceUsd: snapshot.currentPriceUsd,
        expiryMs: snapshot.expiryMs,
        priceUpdatedMs: snapshot.priceUpdatedMs,
        status: snapshot.status,
        strikePriceUsd,
        ladderOffset: offset,
      } satisfies ProMarket
    })
  })
}
