import { Link } from "@tanstack/react-router"
import { TrendingDownIcon } from "lucide-react"

import { AssetIcon } from "@/components/shared/market/asset-icon"
import { Button } from "@/components/ui/button"
import {
  formatExpiryDistance,
  formatExpiryTime,
  formatSignedPercent,
  formatUsd,
} from "@/lib/format"
import { getProtectPresetLabel } from "@/lib/protect-products"
import type { ProtectProduct } from "@/lib/types/protect"
import { cn } from "@/lib/utils"

export interface PageProps {
  products: ProtectProduct[]
}

const columnLabels = ["Product", "Trigger", "Distance", "Expires", "Action"]

function getProtectProductSearch(product: ProtectProduct) {
  return {
    preset: product.preset,
    strike: product.triggerStrikeUsd,
  }
}

export function Page({ products }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <ProtectPageHeader productCount={products.length} />
        <ProtectTable products={products} />
      </section>
    </main>
  )
}

function ProtectPageHeader({ productCount }: { productCount: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-card px-3 py-3 shadow-none ring-0 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          Standalone hedge
        </div>
        <h1 className="mt-1 text-xl font-medium tracking-tight text-foreground">
          Protect
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Premium-paid downside protection backed by one reserved DOWN position
          and held as an owned ProtectionPolicy.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Markets
          </div>
          <div className="mt-0.5 font-mono text-xs font-medium text-foreground tabular-nums">
            {productCount}
          </div>
        </div>
        <Button
          className="bg-primary/10 text-xs text-primary shadow-none hover:bg-primary/15"
          render={<Link to="/protect/claims" />}
          size="sm"
          variant="ghost"
        >
          Claims
        </Button>
      </div>
    </div>
  )
}

function ProtectTable({ products }: { products: ProtectProduct[] }) {
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

      <div className="max-h-[calc(100vh-17rem)] overflow-y-auto overscroll-contain lg:max-h-[calc(100vh-16rem)]">
        {products.length > 0 ? (
          products.map((product) => (
            <ProtectRow key={product.id} product={product} />
          ))
        ) : (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No Protect markets are available.
          </div>
        )}
      </div>
    </div>
  )
}

function ProtectRow({ product }: { product: ProtectProduct }) {
  return (
    <div className="border-b border-border/35 last:border-b-0">
      <div className="hidden min-h-14 px-3 py-2 transition-colors hover:bg-accent/25 lg:grid lg:grid-cols-[minmax(16rem,1.6fr)_1fr_0.75fr_0.85fr_7rem] lg:items-center">
        <ProductIdentity product={product} />
        <Metric
          className="text-outcome-down"
          subValue="At or below"
          value={`≤ ${formatUsd(product.triggerStrikeUsd, 0)}`}
        />
        <Metric
          className="text-outcome-down"
          subValue="From spot"
          value={formatSignedPercent(product.distancePercent)}
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
            value={`≤ ${formatUsd(product.triggerStrikeUsd, 0)}`}
          />
          <MobileMetric
            className="text-outcome-down"
            label="Distance"
            value={formatSignedPercent(product.distancePercent)}
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

function ProductIdentity({ product }: { product: ProtectProduct }) {
  return (
    <Link
      aria-label={`Open ${product.market.assetName} Protect`}
      className="group flex min-w-0 items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      params={{ oracleId: product.market.oracleId }}
      search={getProtectProductSearch(product)}
      to="/protect/$oracleId"
    >
      <AssetIcon
        assetIconUrl={product.market.assetIconUrl}
        assetName={product.market.assetName}
        assetSymbol={product.market.assetSymbol}
        className="size-6"
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-foreground group-hover:text-primary">
          <TrendingDownIcon className="size-3 shrink-0 text-outcome-down" />
          <span className="truncate">
            {product.market.assetSymbol} Protect ·{" "}
            {getProtectPresetLabel(product.preset)}
          </span>
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          <span>Spot {formatUsd(product.market.currentPriceUsd, 0)}</span>
          <span>·</span>
          <span>DOWN hedge</span>
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

function ActionButton({ product }: { product: ProtectProduct }) {
  return (
    <div className="flex items-center justify-end lg:border-l lg:border-border/25 lg:pl-3">
      <Button
        className="min-w-20 bg-primary/10 text-xs text-primary shadow-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        render={
          <Link
            params={{ oracleId: product.market.oracleId }}
            search={getProtectProductSearch(product)}
            to="/protect/$oracleId"
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
