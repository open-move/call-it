import type { PredictionActivity, TradeMarket } from "@/lib/types/trade"
import type { ToolbarOption } from "@/components/markets/header"
import { formatPercent, formatSignedPercent, formatSignedUsd } from "@/lib/format"

export type MarketSort = "expiry" | "move" | "volume"

export const defaultSort: MarketSort = "expiry"

/** Sentinel expiry-filter value that swaps the table to resolved/expired markets. */
export const EXPIRED_EXPIRY = "expired"

export const expiryTabs = [
  { label: "All", value: undefined },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
  { label: "7d", value: "7d" },
  { label: "Expired", value: EXPIRED_EXPIRY },
] satisfies ToolbarOption[]

export const expiryMsByValue: Record<string, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
}

export function getAssetOptions(markets: TradeMarket[]): ToolbarOption[] {
  const assetMap = new Map<string, ToolbarOption>()

  markets.forEach((market) => {
    assetMap.set(market.assetSymbol, {
      label: market.assetSymbol,
      value: market.assetSymbol,
    })
  })

  return [
    { label: "All", value: undefined },
    ...Array.from(assetMap.values()).sort((firstAsset, secondAsset) =>
      firstAsset.label.localeCompare(secondAsset.label)
    ),
  ]
}

export function getSelectedAsset(assetOptions: ToolbarOption[], assetParam?: string) {
  return assetOptions.some((asset) => asset.value === assetParam)
    ? (assetParam ?? undefined)
    : undefined
}

export function getSelectedExpiry(expiryParam: string | null) {
  if (expiryParam === EXPIRED_EXPIRY) {
    return EXPIRED_EXPIRY
  }
  return expiryParam && expiryParam in expiryMsByValue ? expiryParam : undefined
}

export function getSelectedSort(sortParam: string | null): MarketSort {
  return sortParam === "volume" || sortParam === "move"
    ? sortParam
    : defaultSort
}

export function filterMarketsByAsset(markets: TradeMarket[], selectedAsset?: string) {
  return selectedAsset
    ? markets.filter((market) => market.assetSymbol === selectedAsset)
    : markets
}

export function filterMarketsByExpiry(
  markets: TradeMarket[],
  selectedExpiry?: string
) {
  if (!selectedExpiry) {
    return markets
  }

  const horizonMs = expiryMsByValue[selectedExpiry]
  const cutoffMs = Date.now() + horizonMs

  return markets.filter((market) => market.expiryMs <= cutoffMs)
}

export function filterMarketsBySearch(markets: TradeMarket[], searchQuery: string) {
  const normalizedQuery = searchQuery.trim().toLowerCase()

  if (!normalizedQuery) {
    return markets
  }

  return markets.filter((market) => {
    return [market.assetName, market.assetSymbol, market.oracleId]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  })
}

export function filterMarketsByRecentTrades(
  markets: TradeMarket[],
  withTradesOnly: boolean
) {
  return withTradesOnly
    ? markets.filter((market) => market.tradeCount > 0)
    : markets
}

export function sortMarkets(markets: TradeMarket[], sort: MarketSort = defaultSort) {
  return markets.slice().sort((firstMarket, secondMarket) => {
    if (sort === "volume") {
      return (
        secondMarket.volumeUsd - firstMarket.volumeUsd ||
        firstMarket.expiryMs - secondMarket.expiryMs ||
        firstMarket.assetSymbol.localeCompare(secondMarket.assetSymbol)
      )
    }

    if (sort === "move") {
      return (
        Math.abs(secondMarket.priceChangePercent) -
          Math.abs(firstMarket.priceChangePercent) ||
        firstMarket.expiryMs - secondMarket.expiryMs ||
        firstMarket.assetSymbol.localeCompare(secondMarket.assetSymbol)
      )
    }

    return (
      firstMarket.expiryMs - secondMarket.expiryMs ||
      secondMarket.volumeUsd - firstMarket.volumeUsd ||
      firstMarket.assetSymbol.localeCompare(secondMarket.assetSymbol)
    )
  })
}

export function getTopMarkets(markets: TradeMarket[]) {
  return markets
    .slice()
    .sort(
      (firstMarket, secondMarket) =>
        secondMarket.volumeUsd - firstMarket.volumeUsd ||
        firstMarket.expiryMs - secondMarket.expiryMs
    )
    .slice(0, 3)
}

export function getDistance(market: TradeMarket) {
  const distanceUsd = market.currentPriceUsd - market.strikePriceUsd
  const distancePercent =
    market.strikePriceUsd === 0
      ? 0
      : (distanceUsd / market.strikePriceUsd) * 100

  return { distancePercent, distanceUsd }
}

export function formatUpShare(activity: PredictionActivity) {
  const directionalVolumeUsd = activity.upVolumeUsd + activity.downVolumeUsd

  if (directionalVolumeUsd <= 0) {
    return "--"
  }

  return formatPercent(activity.upVolumeUsd / directionalVolumeUsd)
}
