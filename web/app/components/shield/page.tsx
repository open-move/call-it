import { ActivityIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router"

import { AssetIcon } from "~/components/shared/market/asset-icon"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { formatCompactUsd, formatUsd } from "~/lib/callit/format"
import {
  getShieldPresetLabel,
  getShieldProductHref,
} from "~/lib/callit/shield/products"
import {
  type ShieldPreset,
  type ShieldProduct,
} from "~/lib/callit/shield/types"
import { cn } from "~/lib/utils"

export interface PageProps {
  products: ShieldProduct[]
}

interface ToolbarOption {
  count?: number
  label: string
  value?: string
}

const expiryTabs = [
  { label: "All expiries", value: undefined },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
  { label: "7d", value: "7d" },
] satisfies ToolbarOption[]

const protectionTabs = [
  { label: "All protection", value: undefined },
  { label: "Light", value: "light" },
  { label: "Balanced", value: "balanced" },
  { label: "Tail", value: "tail" },
] satisfies ToolbarOption[]

const expiryMsByValue: Record<string, number> = {
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
}

const columnLabels = [
  "Product",
  "Protection",
  "Yield Source",
  "Budget",
  "Distance",
  "Expires",
  "Action",
]

function getAssetOptions(products: ShieldProduct[]): ToolbarOption[] {
  const assetMap = new Map<string, ToolbarOption>()

  for (const product of products) {
    const assetSymbol = product.market.assetSymbol
    const existingAsset = assetMap.get(assetSymbol)

    if (existingAsset) {
      existingAsset.count = (existingAsset.count ?? 0) + 1
      continue
    }

    assetMap.set(assetSymbol, {
      count: 1,
      label: assetSymbol,
      value: assetSymbol,
    })
  }

  return [
    { label: "All", value: undefined },
    ...Array.from(assetMap.values()).sort((firstAsset, secondAsset) =>
      firstAsset.label.localeCompare(secondAsset.label)
    ),
  ]
}

function getSelectedOption(options: ToolbarOption[], value: string | null) {
  return options.some((option) => option.value === value)
    ? (value ?? undefined)
    : undefined
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

function formatSignedUsd(value: number) {
  const displayValue = Math.abs(value) < 0.5 ? 0 : value

  return `${displayValue >= 0 ? "+" : ""}${formatUsd(displayValue, 0)}`
}

function formatSignedPercent(value: number) {
  const displayValue = Math.abs(value) < 0.005 ? 0 : value

  return `${displayValue >= 0 ? "+" : ""}${displayValue.toFixed(2)}%`
}

function filterProducts({
  products,
  searchQuery,
  selectedAsset,
  selectedExpiry,
  selectedProtection,
}: {
  products: ShieldProduct[]
  searchQuery: string
  selectedAsset?: string
  selectedExpiry?: string
  selectedProtection?: string
}) {
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const expiryCutoffMs = selectedExpiry
    ? Date.now() + expiryMsByValue[selectedExpiry]
    : undefined

  return products.filter((product) => {
    if (selectedAsset && product.market.assetSymbol !== selectedAsset) {
      return false
    }

    if (selectedProtection && product.preset !== selectedProtection) {
      return false
    }

    if (expiryCutoffMs && product.market.expiryMs > expiryCutoffMs) {
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
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  })
}

function getPulseStats(products: ShieldProduct[]) {
  const assets = new Set(products.map((product) => product.market.assetSymbol))
  const nearestProduct = products[0]
  const totalLiquidityUsd = products.reduce(
    (total, product) => total + (product.market.volumeUsd ?? 0),
    0
  )

  return {
    assets: assets.size,
    nearestProduct,
    products: products.length,
    totalLiquidityUsd,
  }
}

export function Page({ products }: PageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const assetOptions = getAssetOptions(products)
  const selectedAsset = getSelectedOption(
    assetOptions,
    searchParams.get("asset")
  )
  const selectedExpiry = getSelectedOption(
    expiryTabs,
    searchParams.get("expiry")
  )
  const selectedProtection = getSelectedOption(
    protectionTabs,
    searchParams.get("protection")
  )
  const visibleProducts = filterProducts({
    products,
    searchQuery,
    selectedAsset,
    selectedExpiry,
    selectedProtection,
  })
  const pulseStats = getPulseStats(products)

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
        <LiveShowcase stats={pulseStats} />

        <div className="space-y-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                <ActivityIcon className="size-3.5" />
                Protected yield
              </div>
              <h1 className="mt-1 text-sm font-medium text-foreground">
                Shield
              </h1>
            </div>
            <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase sm:text-right">
              PLP + binary DOWN hedge
            </div>
          </div>

          <ShieldTable
            products={visibleProducts}
            toolbar={
              <Toolbar
                assetOptions={assetOptions}
                expiryOptions={expiryTabs}
                onAssetChange={(asset) => updateFilterParam("asset", asset)}
                onExpiryChange={(expiry) => updateFilterParam("expiry", expiry)}
                onProtectionChange={(protection) =>
                  updateFilterParam("protection", protection)
                }
                onSearchChange={setSearchQuery}
                protectionOptions={protectionTabs}
                searchQuery={searchQuery}
                selectedAsset={selectedAsset}
                selectedExpiry={selectedExpiry}
                selectedProtection={selectedProtection as ShieldPreset}
                totalCount={products.length}
                visibleCount={visibleProducts.length}
              />
            }
          />
        </div>
      </section>
    </main>
  )
}

function LiveShowcase({ stats }: { stats: ReturnType<typeof getPulseStats> }) {
  return (
    <Card className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="relative px-4 py-5 sm:px-5">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,var(--muted)_0,transparent_55%)] opacity-70" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
              Structured protected yield
            </p>
            <h2 className="mt-3 text-2xl leading-tight font-semibold tracking-tight text-foreground sm:text-3xl">
              Shield PLP deposits with crash protection
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Curated products that supply DUSDC into Predict PLP and reserve a
              budget for a binary DOWN hedge on the selected market expiry.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right sm:flex sm:items-center sm:gap-5">
            <HeroStat label="Products" value={stats.products.toString()} />
            <HeroStat label="Assets" value={stats.assets.toString()} />
            <HeroStat
              label="Nearest"
              value={
                stats.nearestProduct
                  ? formatExpiryDistance(stats.nearestProduct.market.expiryMs)
                  : "--"
              }
            />
            <HeroStat
              label="Activity"
              value={formatCompactUsd(stats.totalLiquidityUsd)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2 sm:bg-transparent sm:p-0">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function ShieldTable({
  products,
  toolbar,
}: {
  products: ShieldProduct[]
  toolbar: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      {toolbar}
      <div className="hidden border-b border-border/40 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:grid lg:grid-cols-[minmax(15rem,1.4fr)_0.9fr_0.8fr_0.7fr_0.75fr_0.75fr_7rem] lg:items-center">
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
      <div className="hidden min-h-14 px-3 py-2 transition-colors hover:bg-accent/25 lg:grid lg:grid-cols-[minmax(15rem,1.4fr)_0.9fr_0.8fr_0.7fr_0.75fr_0.75fr_7rem] lg:items-center">
        <ProductIdentity product={product} />
        <Metric
          className="text-outcome-down"
          subValue={formatSignedPercent(product.distancePercent)}
          value={`Below ${formatUsd(product.protectionStrikeUsd, 0)}`}
        />
        <Metric subValue="Predict PLP" value="Vault share" />
        <Metric
          subValue="Hedge cap"
          value={`≤${product.hedgeBudgetBps / 100}%`}
        />
        <Metric
          className="text-outcome-down"
          subValue={formatSignedPercent(product.distancePercent)}
          value={formatSignedUsd(product.distanceUsd)}
        />
        <Metric
          subValue="Live"
          value={formatExpiryDistance(product.market.expiryMs)}
        />
        <ActionButton product={product} />
      </div>

      <div className="space-y-2 px-3 py-3 lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <ProductIdentity product={product} />
          <div className="rounded-md bg-outcome-up/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-outcome-up uppercase">
            Live
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
          <MobileMetric
            className="text-outcome-down"
            label="Protection"
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
      to={getShieldProductHref(product)}
    >
      <AssetIcon
        assetIconUrl={product.market.assetIconUrl}
        assetName={product.market.assetName}
        assetSymbol={product.market.assetSymbol}
        className="size-6"
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
          {product.market.assetSymbol} Shield ·{" "}
          {getShieldPresetLabel(product.preset)}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          <span className="rounded-md bg-outcome-up/10 px-1.5 py-0.5 text-outcome-up">
            Live
          </span>
          <span>Spot {formatUsd(product.market.currentPriceUsd, 0)}</span>
          <span>PLP + DOWN</span>
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
      <Link
        className="inline-flex h-7 min-w-20 items-center justify-center rounded-md bg-primary/10 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        to={getShieldProductHref(product)}
      >
        Open
      </Link>
    </div>
  )
}

function Toolbar({
  assetOptions,
  expiryOptions,
  onAssetChange,
  onExpiryChange,
  onProtectionChange,
  onSearchChange,
  protectionOptions,
  searchQuery,
  selectedAsset,
  selectedExpiry,
  selectedProtection,
  totalCount,
  visibleCount,
}: {
  assetOptions: ToolbarOption[]
  expiryOptions: ToolbarOption[]
  onAssetChange: (asset?: string) => void
  onExpiryChange: (expiry?: string) => void
  onProtectionChange: (protection?: string) => void
  onSearchChange: (search: string) => void
  protectionOptions: ToolbarOption[]
  searchQuery: string
  selectedAsset?: string
  selectedExpiry?: string
  selectedProtection?: ShieldPreset
  totalCount: number
  visibleCount: number
}) {
  return (
    <div className="space-y-2 border-b border-border/40 bg-card px-3 py-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Asset
          </span>
          <ToolbarTabs
            onChange={onAssetChange}
            options={assetOptions}
            selectedValue={selectedAsset}
          />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <div className="relative min-w-0 flex-1 lg:w-72 lg:flex-none">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search Shield products"
              className="h-8 border-0 bg-muted/60 pl-8 text-xs shadow-none ring-0 focus-visible:ring-1"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search shields"
              value={searchQuery}
            />
          </div>
          <Button
            aria-label="Filters"
            className="size-8 border-0 bg-muted/60 text-muted-foreground shadow-none ring-0 hover:bg-accent focus-visible:ring-1"
            size="icon"
            type="button"
            variant="outline"
          >
            <SlidersHorizontalIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Expiry
          </span>
          <ToolbarTabs
            onChange={onExpiryChange}
            options={expiryOptions}
            selectedValue={selectedExpiry}
          />
        </div>
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:text-right">
          {visibleCount} / {totalCount} shields
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Protection
        </span>
        <ToolbarTabs
          onChange={onProtectionChange}
          options={protectionOptions}
          selectedValue={selectedProtection}
        />
      </div>
    </div>
  )
}

function ToolbarTabs({
  onChange,
  options,
  selectedValue,
}: {
  onChange: (value?: string) => void
  options: ToolbarOption[]
  selectedValue?: string
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const isSelected = selectedValue === option.value

        return (
          <button
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
              isSelected && "bg-primary/10 text-primary hover:bg-primary/15"
            )}
            key={option.value ?? "all"}
            onClick={() => onChange(option.value)}
            type="button"
          >
            <span>{option.label}</span>
            {option.count !== undefined && (
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
