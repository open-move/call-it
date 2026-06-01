import { useSearchParams } from "react-router"

import { type TradeMarket } from "~/lib/callit/trade/types"

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
    { label: "All assets", value: undefined },
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

export function Page({ markets }: PageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const assetOptions = getAssetOptions(markets)
  const assetParam = searchParams.get("asset") ?? undefined
  const selectedAsset = getSelectedAsset(assetOptions, assetParam)
  const selectedExpiry = getSelectedExpiry(searchParams.get("expiry"))
  const assetFilteredMarkets = filterMarketsByAsset(markets, selectedAsset)
  const visibleMarkets = filterMarketsByExpiry(
    assetFilteredMarkets,
    selectedExpiry
  )

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
    <main className="mx-auto w-full max-w-[96rem] px-4 py-5 sm:px-6 lg:px-8">
      <section className="space-y-4">
        {markets.length > 0 ? (
          <Table
            markets={visibleMarkets}
            toolbar={
              <Toolbar
                assetOptions={assetOptions}
                expiryOptions={expiryTabs}
                onAssetChange={(asset) => updateFilterParam("asset", asset)}
                onExpiryChange={(expiry) => updateFilterParam("expiry", expiry)}
                selectedAsset={selectedAsset}
                selectedExpiry={selectedExpiry}
                totalCount={markets.length}
                visibleCount={visibleMarkets.length}
              />
            }
          />
        ) : (
          <div className="rounded-md border border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            No live markets are available right now.
          </div>
        )}
      </section>
    </main>
  )
}
