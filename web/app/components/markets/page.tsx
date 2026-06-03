import { ArrowUpRightIcon, FlameIcon, TimerIcon } from "lucide-react"
import { useState } from "react"
import { Link, useSearchParams } from "react-router"

import { AssetIcon } from "~/components/shared/market/asset-icon"
import { formatUsd } from "~/lib/callit/format"
import { type TradeMarket } from "~/lib/callit/trade/types"
import { cn } from "~/lib/utils"

import { Sparkline } from "./sparkline"
import { Table } from "./table"
import { Toolbar, type ToolbarOption } from "./toolbar"

export interface PageProps {
  markets: TradeMarket[]
}

const expiryTabs = [
  { label: "All expiries", value: undefined },
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

function getAssetOptions(markets: TradeMarket[]): ToolbarOption[] {
  const assetMap = new Map<string, ToolbarOption>()

  markets.forEach((market) => {
    const existingAsset = assetMap.get(market.assetSymbol)

    if (existingAsset) {
      existingAsset.count = (existingAsset.count ?? 0) + 1
      return
    }

    assetMap.set(market.assetSymbol, {
      count: 1,
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

function sortMarkets(markets: TradeMarket[]) {
  return markets
    .slice()
    .sort(
      (firstMarket, secondMarket) =>
        firstMarket.expiryMs - secondMarket.expiryMs ||
        secondMarket.volumeUsd - firstMarket.volumeUsd ||
        firstMarket.assetSymbol.localeCompare(secondMarket.assetSymbol)
    )
}

function formatCompactUsd(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`
  }

  return formatUsd(value, 0)
}

function formatExpiryDistance(expiryMs: number, nowMs = Date.now()) {
  const remainingMs = expiryMs - nowMs

  if (remainingMs <= 0) {
    return "Expired"
  }

  const minutes = Math.round(remainingMs / 60_000)

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.round(minutes / 60)

  if (hours < 48) {
    return `${hours}h`
  }

  return `${Math.round(hours / 24)}d`
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

function getPulseStats(markets: TradeMarket[]) {
  const assets = new Set(markets.map((market) => market.assetSymbol))
  const totalVolumeUsd = markets.reduce(
    (totalVolume, market) => totalVolume + market.volumeUsd,
    0
  )
  const totalTradeCount = markets.reduce(
    (totalTrades, market) => totalTrades + market.tradeCount,
    0
  )
  const nearestMarket = sortMarkets(markets)[0]

  return {
    assets: assets.size,
    nearestMarket,
    totalTradeCount,
    totalVolumeUsd,
  }
}

export function Page({ markets }: PageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const assetOptions = getAssetOptions(markets)
  const assetParam = searchParams.get("asset") ?? undefined
  const selectedAsset = getSelectedAsset(assetOptions, assetParam)
  const selectedExpiry = getSelectedExpiry(searchParams.get("expiry"))
  const assetFilteredMarkets = filterMarketsByAsset(markets, selectedAsset)
  const visibleMarkets = sortMarkets(
    filterMarketsBySearch(
      filterMarketsByExpiry(assetFilteredMarkets, selectedExpiry),
      searchQuery
    )
  )
  const topMarkets = getTopMarkets(markets)
  const pulseStats = getPulseStats(markets)

  function updateFilterParam(key: string, value?: string) {
    const nextSearchParams = new URLSearchParams(searchParams)

    if (value) {
      nextSearchParams.set(key, value)
    } else {
      nextSearchParams.delete(key)
    }

    setSearchParams(nextSearchParams)
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        {markets.length > 0 ? (
          <div className="flex flex-col gap-6">
            <LiveShowcase markets={topMarkets} pulseStats={pulseStats} />

            <div className="space-y-2">
              <div className="text-md font-medium text-foreground">Markets</div>

              <Toolbar
                assetOptions={assetOptions}
                expiryOptions={expiryTabs}
                onAssetChange={(asset) => updateFilterParam("asset", asset)}
                onExpiryChange={(expiry) => updateFilterParam("expiry", expiry)}
                onSearchChange={setSearchQuery}
                searchQuery={searchQuery}
                selectedAsset={selectedAsset}
                selectedExpiry={selectedExpiry}
                totalCount={markets.length}
                visibleCount={visibleMarkets.length}
              />

              <Table
                markets={visibleMarkets}
                toolbar={
                  <Toolbar
                    assetOptions={assetOptions}
                    expiryOptions={expiryTabs}
                    onAssetChange={(asset) => updateFilterParam("asset", asset)}
                    onExpiryChange={(expiry) =>
                      updateFilterParam("expiry", expiry)
                    }
                    onSearchChange={setSearchQuery}
                    searchQuery={searchQuery}
                    selectedAsset={selectedAsset}
                    selectedExpiry={selectedExpiry}
                    totalCount={markets.length}
                    visibleCount={visibleMarkets.length}
                  />
                }
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

function LiveShowcase({
  markets,
  pulseStats,
}: {
  markets: TradeMarket[]
  pulseStats: ReturnType<typeof getPulseStats>
}) {
  const [featuredMarket] = markets

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.64fr)]">
      <div className="rounded-md border-0 bg-card p-3 shadow-none ring-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-sm leading-none font-medium text-foreground">
            <FlameIcon className="size-3.5 translate-y-px text-outcome-down" />
            Top Markets
          </div>
        </div>

        <div className="space-y-0.5">
          {markets.map((market) => (
            <Link
              className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              key={market.id}
              to={`/markets/${market.oracleId}?strike=${market.strikePriceUsd}`}
            >
              <AssetIcon
                assetIconUrl={market.assetIconUrl}
                assetName={market.assetName}
                assetSymbol={market.assetSymbol}
                className="size-6"
              />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-foreground">
                  {market.assetSymbol} Prediction · expires in{" "}
                  {formatExpiryDistance(market.expiryMs)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground uppercase">
                  {formatCompactUsd(market.volumeUsd)} volume ·{" "}
                  {market.tradeCount} txns
                </div>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div className="text-xs font-medium text-foreground">
                  {market.fairUpProbability === undefined
                    ? "--"
                    : `${Math.round(market.fairUpProbability * 100)}%`}
                </div>
                <div
                  className={cn(
                    "text-[10px]",
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                Market pulse
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">
                Active Predict flow
              </div>
            </div>
            <TimerIcon className="size-5 text-primary" />
          </div>

          {featuredMarket && (
            <Sparkline
              className="relative h-10 opacity-90"
              points={featuredMarket.priceHistory}
            />
          )}

          <div className="relative grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <PulseMetric label="Markets" value={markets.length.toString()} />
            <PulseMetric label="Assets" value={pulseStats.assets.toString()} />
            <PulseMetric
              label="Volume"
              value={formatCompactUsd(pulseStats.totalVolumeUsd)}
            />
            <PulseMetric
              label="Txns"
              value={pulseStats.totalTradeCount.toString()}
            />
          </div>

          {pulseStats.nearestMarket && (
            <Link
              className="relative inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
              to={`/markets/${pulseStats.nearestMarket.oracleId}?strike=${pulseStats.nearestMarket.strikePriceUsd}`}
            >
              Next expiry in{" "}
              {formatExpiryDistance(pulseStats.nearestMarket.expiryMs)}
              <ArrowUpRightIcon className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function PulseMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}
