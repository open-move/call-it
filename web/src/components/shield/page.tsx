import { SearchIcon, SlidersHorizontalIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "@tanstack/react-router"

import { AssetIcon } from "@/components/shared/market/asset-icon"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  formatExpiryDistance,
  formatExpiryTime,
  formatSignedPercent,
  formatUsd,
} from "@/lib/format"
import {
  getShieldPresetLabel,
  getShieldTenorLabel,
} from "@/lib/shield-products"
import type {ShieldPreset, ShieldProduct, ShieldTenor} from "@/lib/types/shield";
import { useAppSearchParams } from "@/lib/hooks/router"
import { cn } from "@/lib/utils"

export interface PageProps {
  products: ShieldProduct[]
}

interface FilterOption {
  label: string
  value?: string
}

function getShieldProductSearch(product: ShieldProduct) {
  return {
    preset: product.preset,
    strike: product.protectionStrikeUsd,
  }
}

type ShieldSort = "expiry" | "budget" | "distance"

const defaultSort: ShieldSort = "expiry"

const TENOR_OPTIONS = [
  { label: "All", value: undefined },
  { label: "Standard", value: "standard" },
  { label: "Weekly", value: "weekly" },
] satisfies FilterOption[]

const PROTECTION_OPTIONS = [
  { label: "All", value: undefined },
  { label: "Light", value: "light" },
  { label: "Balanced", value: "balanced" },
  { label: "Tail", value: "tail" },
] satisfies FilterOption[]

const columnLabels = ["Product", "Trigger", "Budget", "Expires", "Action"]

function getAssetOptions(products: ShieldProduct[]): FilterOption[] {
  const assetMap = new Map<string, FilterOption>()

  for (const product of products) {
    const assetSymbol = product.market.assetSymbol

    if (!assetMap.has(assetSymbol)) {
      assetMap.set(assetSymbol, {
        label: assetSymbol,
        value: assetSymbol,
      })
    }
  }

  return [
    { label: "All", value: undefined },
    ...Array.from(assetMap.values()).sort((firstAsset, secondAsset) =>
      firstAsset.label.localeCompare(secondAsset.label)
    ),
  ]
}

function getSelectedOption(options: FilterOption[], value: string | null) {
  return options.some((option) => option.value === value)
    ? (value ?? undefined)
    : undefined
}

function getSelectedSort(sortParam: string | null): ShieldSort {
  return sortParam === "budget" || sortParam === "distance"
    ? sortParam
    : defaultSort
}

function filterProducts({
  products,
  searchQuery,
  selectedAsset,
  selectedProtection,
  selectedTenor,
}: {
  products: ShieldProduct[]
  searchQuery: string
  selectedAsset?: string
  selectedProtection?: string
  selectedTenor?: string
}) {
  const normalizedQuery = searchQuery.trim().toLowerCase()

  return products.filter((product) => {
    if (selectedAsset && product.market.assetSymbol !== selectedAsset) {
      return false
    }

    if (selectedTenor && product.tenor !== selectedTenor) {
      return false
    }

    if (selectedProtection && product.preset !== selectedProtection) {
      return false
    }

    if (!normalizedQuery) {
      return true
    }

    return [
      product.market.assetName,
      product.market.assetSymbol,
      product.market.oracleId,
      getShieldPresetLabel(product.preset),
      getShieldTenorLabel(product.tenor),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  })
}

function sortProducts(products: ShieldProduct[], sort: ShieldSort) {
  return products.slice().sort((firstProduct, secondProduct) => {
    if (sort === "budget") {
      return (
        secondProduct.hedgeBudgetBps - firstProduct.hedgeBudgetBps ||
        firstProduct.market.expiryMs - secondProduct.market.expiryMs ||
        firstProduct.market.assetSymbol.localeCompare(
          secondProduct.market.assetSymbol
        )
      )
    }

    if (sort === "distance") {
      return (
        Math.abs(firstProduct.distancePercent) -
          Math.abs(secondProduct.distancePercent) ||
        firstProduct.market.expiryMs - secondProduct.market.expiryMs ||
        firstProduct.market.assetSymbol.localeCompare(
          secondProduct.market.assetSymbol
        )
      )
    }

    return (
      firstProduct.market.expiryMs - secondProduct.market.expiryMs ||
      firstProduct.market.assetSymbol.localeCompare(
        secondProduct.market.assetSymbol
      ) ||
      firstProduct.protectionStrikeUsd - secondProduct.protectionStrikeUsd
    )
  })
}

export function Page({ products }: PageProps) {
  const [searchParams, setSearchParams] = useAppSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const assetOptions = getAssetOptions(products)
  const selectedAsset = getSelectedOption(
    assetOptions,
    searchParams.get("asset")
  )
  const selectedTenor = getSelectedOption(
    TENOR_OPTIONS,
    searchParams.get("tenor")
  )
  const selectedProtection = getSelectedOption(
    PROTECTION_OPTIONS,
    searchParams.get("protection")
  )
  const selectedSort = getSelectedSort(searchParams.get("sort"))
  const visibleProducts = sortProducts(
    filterProducts({
      products,
      searchQuery,
      selectedAsset,
      selectedProtection,
      selectedTenor,
    }),
    selectedSort
  )

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

    for (const key of ["asset", "tenor", "protection", "sort"]) {
      nextSearchParams.delete(key)
    }

    setSearchQuery("")
    setSearchParams(nextSearchParams)
  }

  function updateSort(sort: ShieldSort) {
    updateFilterParam("sort", sort === defaultSort ? undefined : sort)
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-foreground">Shield</div>

            <ShieldSearchControls
              assetOptions={assetOptions}
              onAssetChange={(asset) => updateFilterParam("asset", asset)}
              onProtectionChange={(protection) =>
                updateFilterParam("protection", protection)
              }
              onResetFilters={resetFilters}
              onSearchChange={setSearchQuery}
              onSortChange={updateSort}
              onTenorChange={(tenor) => updateFilterParam("tenor", tenor)}
              protectionOptions={PROTECTION_OPTIONS}
              searchQuery={searchQuery}
              selectedAsset={selectedAsset}
              selectedProtection={selectedProtection as ShieldPreset}
              selectedSort={selectedSort}
              selectedTenor={selectedTenor as ShieldTenor}
              tenorOptions={TENOR_OPTIONS}
            />
          </div>

          <ShieldTable products={visibleProducts} />
        </div>
      </section>
    </main>
  )
}

function ShieldTable({ products }: { products: ShieldProduct[] }) {
  return (
    <div className="overflow-hidden rounded-md bg-card py-0 shadow-none ring-0">
      <div className="hidden border-b border-border/40 bg-card px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:grid lg:grid-cols-[minmax(16rem,1.6fr)_1fr_0.75fr_0.85fr_7rem] lg:items-center">
        {columnLabels.map((label, index) => (
          <div
            className={cn(
              index > 0 && "border-l border-border/25 pl-4",
              index > 1 && "text-right"
            )}
            key={label}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="max-h-[calc(100vh-19rem)] overflow-y-auto overscroll-contain lg:max-h-[calc(100vh-18rem)]">
        {products.length > 0 ? (
          products.map((product) => (
            <ShieldRow key={product.id} product={product} />
          ))
        ) : (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No Shield products match these filters.
          </div>
        )}
      </div>
    </div>
  )
}

function ShieldRow({ product }: { product: ShieldProduct }) {
  return (
    <div className="border-b border-border/35 last:border-b-0">
      <div className="hidden min-h-14 px-3 py-2 transition-colors hover:bg-accent/25 lg:grid lg:grid-cols-[minmax(16rem,1.6fr)_1fr_0.75fr_0.85fr_7rem] lg:items-center">
        <ProductIdentity product={product} />
        <Metric
          className="text-outcome-down"
          subValue={formatSignedPercent(product.distancePercent)}
          value={`Below ${formatUsd(product.protectionStrikeUsd, 0)}`}
        />
        <Metric
          subValue="Hedge cap"
          value={`≤${product.hedgeBudgetBps / 100}%`}
        />
        <Metric
          subValue={formatExpiryTime(product.market.expiryMs)}
          value={formatExpiryDistance(product.market.expiryMs)}
        />
        <ActionButton product={product} />
      </div>

      <div className="space-y-2 px-3 py-3 lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <ProductIdentity product={product} />
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
          <MobileMetric
            className="text-outcome-down"
            label="Trigger"
            value={`Below ${formatUsd(product.protectionStrikeUsd, 0)}`}
          />
          <MobileMetric
            className="text-outcome-down"
            label="Distance"
            value={formatSignedPercent(product.distancePercent)}
          />
          <MobileMetric
            label="Budget"
            value={`≤${product.hedgeBudgetBps / 100}%`}
          />
          <MobileMetric
            label="Expires"
            value={formatExpiryDistance(product.market.expiryMs)}
          />
        </div>
        <ActionButton product={product} />
      </div>
    </div>
  )
}

function ProductIdentity({ product }: { product: ShieldProduct }) {
  return (
    <Link
      aria-label={`Open ${product.market.assetName} Shield`}
      className="group flex min-w-0 items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      params={{ oracleId: product.market.oracleId }}
      search={getShieldProductSearch(product)}
      to="/shield/$oracleId"
    >
      <AssetIcon
        assetIconUrl={product.market.assetIconUrl}
        assetName={product.market.assetName}
        assetSymbol={product.market.assetSymbol}
        className="size-6"
      />
      <div className="min-w-0">
        <div className="truncate text-xs text-foreground group-hover:text-primary">
          {product.market.assetSymbol} Shield ·{" "}
          {getShieldTenorLabel(product.tenor)}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          <span>{getShieldPresetLabel(product.preset)}</span>
          <span>·</span>
          <span>Spot {formatUsd(product.market.currentPriceUsd, 0)}</span>
        </div>
      </div>
    </Link>
  )
}

function Metric({
  className,
  subValue,
  value,
}: {
  className?: string
  subValue?: string
  value: string
}) {
  return (
    <div className="border-l border-border/25 pl-3 text-right font-mono tabular-nums">
      <div className={cn("text-xs font-medium text-foreground", className)}>
        {value}
      </div>
      {subValue && (
        <div className="mt-0.5 text-[10px] text-muted-foreground uppercase">
          {subValue}
        </div>
      )}
    </div>
  )
}

function MobileMetric({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-mono text-xs font-medium text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}

function ActionButton({ product }: { product: ShieldProduct }) {
  return (
    <div className="flex items-center justify-end lg:border-l lg:border-border/25 lg:pl-3">
      <Button
        className="min-w-20 bg-primary/10 text-xs text-primary shadow-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        render={
          <Link
            params={{ oracleId: product.market.oracleId }}
            search={getShieldProductSearch(product)}
            to="/shield/$oracleId"
          />
        }
        size="sm"
        variant="ghost"
      >
        Open
      </Button>
    </div>
  )
}

function ShieldSearchControls({
  assetOptions,
  onAssetChange,
  onProtectionChange,
  onResetFilters,
  onSearchChange,
  onSortChange,
  onTenorChange,
  protectionOptions,
  searchQuery,
  selectedAsset,
  selectedProtection,
  selectedSort,
  selectedTenor,
  tenorOptions,
}: {
  assetOptions: FilterOption[]
  onAssetChange: (asset?: string) => void
  onProtectionChange: (protection?: string) => void
  onResetFilters: () => void
  onSearchChange: (search: string) => void
  onSortChange: (sort: ShieldSort) => void
  onTenorChange: (tenor?: string) => void
  protectionOptions: FilterOption[]
  searchQuery: string
  selectedAsset?: string
  selectedProtection?: ShieldPreset
  selectedSort: ShieldSort
  selectedTenor?: ShieldTenor
  tenorOptions: FilterOption[]
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search shields"
          className="border-0 bg-muted/60 pl-8 text-xs shadow-none ring-0 focus-visible:ring-1"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search shields"
          value={searchQuery}
        />
      </div>

      <FilterMenu
        assetOptions={assetOptions}
        onAssetChange={onAssetChange}
        onProtectionChange={onProtectionChange}
        onResetFilters={onResetFilters}
        onSortChange={onSortChange}
        onTenorChange={onTenorChange}
        protectionOptions={protectionOptions}
        selectedAsset={selectedAsset}
        selectedProtection={selectedProtection}
        selectedSort={selectedSort}
        selectedTenor={selectedTenor}
        tenorOptions={tenorOptions}
      />
    </div>
  )
}

function FilterMenu({
  assetOptions,
  onAssetChange,
  onProtectionChange,
  onResetFilters,
  onSortChange,
  onTenorChange,
  protectionOptions,
  selectedAsset,
  selectedProtection,
  selectedSort,
  selectedTenor,
  tenorOptions,
}: {
  assetOptions: FilterOption[]
  onAssetChange: (asset?: string) => void
  onProtectionChange: (protection?: string) => void
  onResetFilters: () => void
  onSortChange: (sort: ShieldSort) => void
  onTenorChange: (tenor?: string) => void
  protectionOptions: FilterOption[]
  selectedAsset?: string
  selectedProtection?: ShieldPreset
  selectedSort: ShieldSort
  selectedTenor?: ShieldTenor
  tenorOptions: FilterOption[]
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Filters"
            className="border-0 bg-muted/60 text-muted-foreground shadow-none ring-0 hover:bg-accent focus-visible:ring-1"
            size="icon-sm"
            type="button"
            variant="outline"
          />
        }
      >
        <SlidersHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sort</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={selectedSort}
            onValueChange={onSortChange}
          >
            <DropdownMenuRadioItem value="expiry">
              Nearest expiry
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="distance">
              Protection distance
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="budget">
              Hedge budget
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Asset</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={selectedAsset ?? "all"}
            onValueChange={(value) =>
              onAssetChange(value === "all" ? undefined : value)
            }
          >
            {assetOptions.map((option) => (
              <DropdownMenuRadioItem
                key={option.value ?? "all"}
                value={option.value ?? "all"}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tenor</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={selectedTenor ?? "all"}
            onValueChange={(value) =>
              onTenorChange(value === "all" ? undefined : value)
            }
          >
            {tenorOptions.map((option) => (
              <DropdownMenuRadioItem
                key={option.value ?? "all"}
                value={option.value ?? "all"}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Protection</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={selectedProtection ?? "all"}
            onValueChange={(value) =>
              onProtectionChange(value === "all" ? undefined : value)
            }
          >
            {protectionOptions.map((option) => (
              <DropdownMenuRadioItem
                key={option.value ?? "all"}
                value={option.value ?? "all"}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onResetFilters}>
            Reset filters
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
