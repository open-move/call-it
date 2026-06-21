import { useState } from "react"

import { useAppSearchParams } from "@/lib/hooks/router"
import type { PredictionActivity, TradeMarket } from "@/lib/types/trade"
import {
  defaultSort,
  EXPIRED_EXPIRY,
  expiryTabs,
  filterMarketsByAsset,
  filterMarketsByExpiry,
  filterMarketsByRecentTrades,
  filterMarketsBySearch,
  getAssetOptions,
  getSelectedAsset,
  getSelectedExpiry,
  getSelectedSort,
  getTopMarkets,
  sortMarkets,
} from "@/lib/markets/helpers"
import type { MarketSort } from "@/lib/markets/helpers"
import { FeaturedMarkets } from "./featured-markets"
import { Table } from "./table"
import { MarketSearchControls, Toolbar } from "./header"

export interface PageProps {
  expiredMarkets: TradeMarket[]
  markets: TradeMarket[]
  predictionActivity: PredictionActivity
}

export function Page({ expiredMarkets, markets, predictionActivity }: PageProps) {
  const [searchParams, setSearchParams] = useAppSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const assetOptions = getAssetOptions(markets)
  const assetParam = searchParams.get("asset") ?? undefined
  const selectedAsset = getSelectedAsset(assetOptions, assetParam)
  const selectedExpiry = getSelectedExpiry(searchParams.get("expiry"))
  const selectedSort = getSelectedSort(searchParams.get("sort"))
  const withTradesOnly = searchParams.get("traded") === "1"
  const isExpiredView = selectedExpiry === EXPIRED_EXPIRY

  const assetFilteredMarkets = filterMarketsByAsset(
    isExpiredView ? expiredMarkets : markets,
    selectedAsset
  )
  const searchedMarkets = filterMarketsByRecentTrades(
    filterMarketsBySearch(
      isExpiredView
        ? assetFilteredMarkets
        : filterMarketsByExpiry(assetFilteredMarkets, selectedExpiry),
      searchQuery
    ),
    withTradesOnly
  )
  // Expired snapshots arrive newest-first; preserve that for the default sort.
  const visibleMarkets =
    isExpiredView && selectedSort === defaultSort
      ? searchedMarkets
      : sortMarkets(searchedMarkets, selectedSort)
  const topMarkets = getTopMarkets(markets)
  const nearestMarket = sortMarkets(markets)[0]

  function setFilterParam(
    nextSearchParams: URLSearchParams,
    key: string,
    value?: string
  ) {
    if (value) {
      nextSearchParams.set(key, value)
    } else {
      nextSearchParams.delete(key)
    }
  }

  function updateFilterParam(key: string, value?: string) {
    const nextSearchParams = new URLSearchParams(searchParams)

    setFilterParam(nextSearchParams, key, value)
    setSearchParams(nextSearchParams)
  }

  function resetFilters() {
    const nextSearchParams = new URLSearchParams(searchParams)

    for (const key of ["asset", "expiry", "sort", "traded"]) {
      nextSearchParams.delete(key)
    }

    setSearchQuery("")
    setSearchParams(nextSearchParams)
  }

  function updateSort(sort: MarketSort) {
    updateFilterParam("sort", sort === defaultSort ? undefined : sort)
  }

  function updateWithTradesOnly(nextWithTradesOnly: boolean) {
    updateFilterParam("traded", nextWithTradesOnly ? "1" : undefined)
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        {markets.length > 0 || expiredMarkets.length > 0 ? (
          <div className="flex flex-col gap-5 lg:gap-6">
            {markets.length > 0 && (
              <FeaturedMarkets
                liveMarketCount={markets.length}
                markets={topMarkets}
                nearestMarket={nearestMarket}
                predictionActivity={predictionActivity}
              />
            )}

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Toolbar
                  assetOptions={assetOptions}
                  onAssetChange={(asset) => updateFilterParam("asset", asset)}
                  selectedAsset={selectedAsset}
                />

                <MarketSearchControls
                  expiryOptions={expiryTabs}
                  onExpiryChange={(expiry) =>
                    updateFilterParam("expiry", expiry)
                  }
                  onResetFilters={resetFilters}
                  onSearchChange={setSearchQuery}
                  onSortChange={updateSort}
                  onWithTradesOnlyChange={updateWithTradesOnly}
                  searchQuery={searchQuery}
                  selectedExpiry={selectedExpiry}
                  selectedSort={selectedSort}
                  withTradesOnly={withTradesOnly}
                />
              </div>

              <Table
                expired={isExpiredView}
                markets={visibleMarkets}
                onResetFilters={resetFilters}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            No live markets are available right now.
          </div>
        )}
      </section>
    </main>
  )
}
