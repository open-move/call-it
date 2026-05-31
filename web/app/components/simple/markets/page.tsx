import { useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { type SimpleMarket } from "~/lib/callit/simple/types"
import { cn } from "~/lib/utils"

import { Grid } from "./grid"

export interface PageProps {
  markets: SimpleMarket[]
}

type SortMode = "ending" | "closest" | "updated"

function getDistanceToStrike(market: SimpleMarket) {
  return market.currentPriceUsd - market.strikePriceUsd
}

function matchesSearch(market: SimpleMarket, query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return true
  }

  return [market.prompt, market.assetName, market.assetSymbol]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery)
}

function sortMarkets(markets: SimpleMarket[], sortMode: SortMode) {
  return markets.slice().sort((firstMarket, secondMarket) => {
    if (sortMode === "closest") {
      return (
        Math.abs(getDistanceToStrike(firstMarket)) -
        Math.abs(getDistanceToStrike(secondMarket))
      )
    }

    if (sortMode === "updated") {
      return secondMarket.priceUpdatedMs - firstMarket.priceUpdatedMs
    }

    return firstMarket.expiryMs - secondMarket.expiryMs
  })
}

export function Page({ markets }: PageProps) {
  const [assetFilter, setAssetFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [sortMode, setSortMode] = useState<SortMode>("ending")
  const assetFilters = useMemo(
    () => Array.from(new Set(markets.map((market) => market.assetSymbol))),
    [markets]
  )
  const visibleMarkets = useMemo(() => {
    const filteredMarkets = markets.filter(
      (market) =>
        (assetFilter === "all" || market.assetSymbol === assetFilter) &&
        matchesSearch(market, query)
    )

    return sortMarkets(filteredMarkets, sortMode)
  }, [assetFilter, markets, query, sortMode])

  return (
    <section className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8">
      {markets.length > 0 ? (
        <>
          <div className="mb-4 flex flex-col gap-3 border-b border-border/50 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
              <FilterButton
                isActive={assetFilter === "all"}
                label="All"
                onClick={() => setAssetFilter("all")}
              />
              {assetFilters.map((assetSymbol) => (
                <FilterButton
                  isActive={assetFilter === assetSymbol}
                  key={assetSymbol}
                  label={assetSymbol}
                  onClick={() => setAssetFilter(assetSymbol)}
                />
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:w-60">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 border-border/70 bg-surface-raised pl-9 shadow-none ring-0 focus-visible:ring-1"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  value={query}
                />
              </div>

              <div className="flex gap-2 overflow-x-auto">
                <SortButton
                  isActive={sortMode === "ending"}
                  label="Ending soon"
                  onClick={() => setSortMode("ending")}
                />
                <SortButton
                  isActive={sortMode === "closest"}
                  label="Closest"
                  onClick={() => setSortMode("closest")}
                />
                <SortButton
                  isActive={sortMode === "updated"}
                  label="Updated"
                  onClick={() => setSortMode("updated")}
                />
              </div>
            </div>
          </div>

          {visibleMarkets.length > 0 ? (
            <Grid markets={visibleMarkets} />
          ) : (
            <div className="rounded-md border border-border/70 bg-surface-raised px-4 py-8 text-center text-sm text-muted-foreground">
              No live markets match those filters.
            </div>
          )}
        </>
      ) : (
        <div className="rounded-md border border-border/70 bg-surface-raised px-4 py-8 text-center text-sm text-muted-foreground">
          No live markets are available right now.
        </div>
      )}
    </section>
  )
}

function FilterButton({
  isActive,
  label,
  onClick,
}: {
  isActive: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      className={cn(
        "h-9 rounded-md px-3 shadow-none ring-0",
        isActive
          ? "bg-foreground text-background hover:bg-foreground/90"
          : "border-border/70 bg-surface-raised text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
      variant="outline"
    >
      {label}
    </Button>
  )
}

function SortButton({
  isActive,
  label,
  onClick,
}: {
  isActive: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      className={cn(
        "h-9 rounded-md px-3 shadow-none ring-0",
        isActive
          ? "bg-surface-muted text-foreground"
          : "bg-transparent text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
      variant="ghost"
    >
      {label}
    </Button>
  )
}
