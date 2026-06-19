import { ArrowUpRightIcon, FlameIcon, TimerIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "@tanstack/react-router"

import { AssetIcon } from "@/components/shared/market/asset-icon"
import {
  formatCompactUsd,
  formatExpiryDistance,
  formatPercent,
  formatProbability,
  formatUsd,
} from "@/lib/format"
import { useAppSearchParams } from "@/lib/hooks/router"
import type { PredictionActivity, TradeMarket } from "@/lib/types/trade"
import { cn } from "@/lib/utils"

import { Sparkline } from "./sparkline"
import { Table } from "./table"
import { MarketSearchControls, Toolbar } from "./toolbar"
import type { ToolbarOption } from "./toolbar"

export interface PageProps {
  markets: TradeMarket[]
  predictionActivity: PredictionActivity
}

const expiryTabs = [
  { label: "All", value: undefined },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
  { label: "7d", value: "7d" },
] satisfies ToolbarOption[]

const expiryMsByValue: Record<string, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
}

type MarketSort = "expiry" | "move" | "volume"

const defaultSort: MarketSort = "expiry"

function getAssetOptions(markets: TradeMarket[]): ToolbarOption[] {
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

function getSelectedAsset(assetOptions: ToolbarOption[], assetParam?: string) {
  return assetOptions.some((asset) => asset.value === assetParam)
    ? (assetParam ?? undefined)
    : undefined
}

function getSelectedExpiry(expiryParam: string | null) {
  return expiryParam && expiryParam in expiryMsByValue ? expiryParam : undefined
}

function getSelectedSort(sortParam: string | null): MarketSort {
  return sortParam === "volume" || sortParam === "move"
    ? sortParam
    : defaultSort
}

function filterMarketsByAsset(markets: TradeMarket[], selectedAsset?: string) {
  return selectedAsset
    ? markets.filter((market) => market.assetSymbol === selectedAsset)
    : markets
}

function filterMarketsByExpiry(
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

function filterMarketsBySearch(markets: TradeMarket[], searchQuery: string) {
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

function filterMarketsByRecentTrades(
  markets: TradeMarket[],
  withTradesOnly: boolean
) {
  return withTradesOnly
    ? markets.filter((market) => market.tradeCount > 0)
    : markets
}

function sortMarkets(markets: TradeMarket[], sort: MarketSort = defaultSort) {
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

function getTopMarkets(markets: TradeMarket[]) {
  return markets
    .slice()
    .sort(
      (firstMarket, secondMarket) =>
        secondMarket.volumeUsd - firstMarket.volumeUsd ||
        firstMarket.expiryMs - secondMarket.expiryMs
    )
    .slice(0, 3)
}

function formatUpShare(activity: PredictionActivity) {
  const directionalVolumeUsd = activity.upVolumeUsd + activity.downVolumeUsd

  if (directionalVolumeUsd <= 0) {
    return "--"
  }

  return formatPercent(activity.upVolumeUsd / directionalVolumeUsd)
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
            <LiveShowcase
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

function LiveShowcase({
  liveMarketCount,
  markets,
  nearestMarket,
  predictionActivity,
}: {
  liveMarketCount: number
  markets: TradeMarket[]
  nearestMarket?: TradeMarket
  predictionActivity: PredictionActivity
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.58fr)]">
      <div className="rounded-md border-0 bg-card p-3 shadow-none ring-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            <FlameIcon className="size-3.5 translate-y-px text-outcome-down" />
            Top Markets
          </div>
        </div>

        <div className="space-y-0.5">
          {markets.map((market) => (
            <Link
              className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-1.5 transition-[background-color,transform] duration-150 hover:bg-muted/25 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              key={market.id}
              params={{ oracleId: market.oracleId }}
              to="/markets/$oracleId"
            >
              <AssetIcon
                assetIconUrl={market.assetIconUrl}
                assetName={market.assetName}
                assetSymbol={market.assetSymbol}
                className="size-6"
              />
              <div className="min-w-0">
                <div className="truncate text-sm leading-5 font-medium tracking-[-0.01em] text-foreground">
                  {market.assetSymbol}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    Prediction · {formatExpiryDistance(market.expiryMs)}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {formatCompactUsd(market.volumeUsd)}
                  </span>{" "}
                  vol · {market.tradeCount} txns
                </div>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div className="text-sm leading-5 font-semibold text-foreground">
                  {formatProbability(market.fairUpProbability)}
                </div>
                <div
                  className={cn(
                    "text-[11px] leading-4",
                    market.priceChangePercent >= 0
                      ? "text-outcome-up"
                      : "text-outcome-down"
                  )}
                >
                  {market.priceChangePercent >= 0 ? "+" : ""}
                  {market.priceChangePercent.toFixed(2)}%
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-md border-0 bg-card p-3 shadow-none ring-0">
        <div className="relative flex h-full min-h-36 flex-col justify-between gap-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
              <TimerIcon className="size-3.5 translate-y-px text-primary" />
              Prediction Activity
            </div>
          </div>

          <Sparkline
            className="relative h-9 opacity-90"
            points={predictionActivity.volumeSparkline}
          />

          <div className="relative grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <PulseMetric label="Live" value={liveMarketCount.toString()} />
            <PulseMetric
              label="Vol"
              value={formatCompactUsd(predictionActivity.recentVolumeUsd)}
            />
            <PulseMetric
              label="Txns"
              value={predictionActivity.recentTradeCount.toString()}
            />
            <PulseMetric
              label="Up Share"
              value={formatUpShare(predictionActivity)}
            />
          </div>

          {nearestMarket && (
            <Link
              className="group relative inline-flex w-fit items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/85"
              params={{ oracleId: nearestMarket.oracleId }}
              to="/markets/$oracleId"
            >
              Next expiry in {formatExpiryDistance(nearestMarket.expiryMs)}
              <ArrowUpRightIcon className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function PulseMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/35 bg-muted/25 px-2.5 py-1.5">
      <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}
