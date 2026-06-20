import { useState } from "react"

import { useAppSearchParams } from "@/lib/hooks/router"
import type { PredictionActivity, TradeMarket } from "@/lib/types/trade"
import {
  defaultSort,
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
  markets: TradeMarket[]
  predictionActivity: PredictionActivity
}

export function Page({ markets, predictionActivity }: PageProps) {
  const [searchParams, setSearchParams] = useAppSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const assetOptions = getAssetOptions(markets)
  const assetParam = searchParams.get("asset") ?? undefined
  const selectedAsset = getSelectedAsset(assetOptions, assetParam)
  const selectedExpiry = getSelectedExpiry(searchParams.get("expiry"))
  const selectedSort = getSelectedSort(searchParams.get("sort"))
  const withTradesOnly = searchParams.get("traded") === "1"
  const assetFilteredMarkets = filterMarketsByAsset(markets, selectedAsset)
  const visibleMarkets = sortMarkets(
    filterMarketsByRecentTrades(
      filterMarketsBySearch(
        filterMarketsByExpiry(assetFilteredMarkets, selectedExpiry),
        searchQuery
      ),
      withTradesOnly
    ),
    selectedSort
  )
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
        {markets.length > 0 ? (
          <div className="flex flex-col gap-5 lg:gap-6">
            <FeaturedMarkets
              liveMarketCount={markets.length}
              markets={topMarkets}
              nearestMarket={nearestMarket}
              predictionActivity={predictionActivity}
            />

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

              <Table markets={visibleMarkets} onResetFilters={resetFilters} />
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
