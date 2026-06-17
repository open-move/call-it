import { Link } from "@tanstack/react-router"
import { Layers3Icon, LockKeyholeIcon } from "lucide-react"

import { BadgeTone } from "@/components/primitives/badge"
import { ProtectionFamilyHeader } from "@/components/protection/family-header"
import { DetailChartCard } from "@/components/shared/detail/detail-chart-card"
import { buttonVariants } from "@/components/ui/button"
import { formatExpiryDistance, formatSignedPercent, formatUsd } from "@/lib/format"
import { getRangeLadderPresetLabel } from "@/lib/range-ladder-products"
import type { ExpiryOption } from "@/lib/types/market"
import type { RangeLadderProduct } from "@/lib/types/range-ladder"
import { cn } from "@/lib/utils"

export interface DetailPageProps {
  expiryProducts: RangeLadderProduct[]
  product: RangeLadderProduct
}

function getRangeLadderProductHref(product: RangeLadderProduct) {
  const searchParams = new URLSearchParams({
    preset: product.preset,
  })

  return `/range-ladder/${product.market.oracleId}?${searchParams.toString()}`
}

function getRangeLadderExpiryOptions(
  products: RangeLadderProduct[]
): ExpiryOption[] {
  return products.map((product) => ({
    assetSymbol: product.market.assetSymbol,
    expiryMs: product.market.expiryMs,
    oracleId: product.market.oracleId,
    status: product.market.status,
  }))
}

function getDeepestStrikeUsd(product: RangeLadderProduct) {
  return Math.min(...product.rungs.map((rung) => rung.lowerStrikeUsd))
}

export function DetailPage({ expiryProducts, product }: DetailPageProps) {
  const expiryOptions = getRangeLadderExpiryOptions(expiryProducts)
  const topBand = product.rungs[0]
  const deepestStrikeUsd = getDeepestStrikeUsd(product)

  return (
    <main className="mx-auto w-full max-w-384 px-4 py-4 sm:px-6 lg:px-8">
      <div className="mb-3">
        <ProtectionFamilyHeader
          actions={[
            { href: "/range-ladder/claims", label: "Claims" },
            { href: "/range-ladder", label: "All Ladders" },
          ]}
          description={`Product 2 · ${product.market.assetSymbol} ${getRangeLadderPresetLabel(product.preset)} range ladder preview with ${product.rungs.length} bands. Transaction wiring remains disabled until Range Ladder package IDs are configured.`}
          title="Range Ladder"
        />
      </div>

      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="grid min-w-0 gap-3">
          <div className="h-120 min-w-0">
            <DetailChartCard
              assetIconUrl={product.market.assetIconUrl}
              assetName={product.market.assetName}
              assetSymbol={product.market.assetSymbol}
              badgeLabel="Preview"
              badgeTone={BadgeTone.Neutral}
              expiryOptions={expiryOptions}
              getExpiryHref={(option) =>
                getRangeLadderProductHref(
                  expiryProducts.find(
                    (expiryProduct) =>
                      expiryProduct.market.oracleId === option.oracleId
                  ) ?? product
                )
              }
              metrics={[
                { label: "Preset", value: getRangeLadderPresetLabel(product.preset) },
                { label: "Rungs", value: product.rungs.length.toString() },
                {
                  className: "text-outcome-down",
                  label: "Deepest",
                  value: formatSignedPercent(product.distancePercent),
                },
                {
                  label: "Top Band",
                  value: topBand
                    ? `${formatUsd(topBand.lowerStrikeUsd, 0)} - ${formatUsd(topBand.higherStrikeUsd, 0)}`
                    : "--",
                },
                {
                  label: "Expires",
                  value: formatExpiryDistance(product.market.expiryMs),
                },
              ]}
              points={product.market.priceHistory}
              referenceLabel="Deepest"
              referencePriceUsd={deepestStrikeUsd}
              selectedOracleId={product.market.oracleId}
              title={`${product.market.assetSymbol} Ladder · ${getRangeLadderPresetLabel(product.preset)}`}
            />
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Layers3Icon className="size-4 text-primary" />
                Rung rail
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Read-only builder
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {product.rungs.map((rung, index) => (
                <div
                  className="relative rounded-md border border-border/60 bg-background/45 p-3"
                  key={`${rung.lowerStrikeUsd}-${rung.higherStrikeUsd}`}
                >
                  <span className="absolute top-3 right-3 font-mono text-[10px] text-muted-foreground">
                    0{index + 1}
                  </span>
                  <div className="font-mono text-sm text-foreground">
                    {formatUsd(rung.lowerStrikeUsd, 0)} - {formatUsd(rung.higherStrikeUsd, 0)}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Cost {rung.costTier}</span>
                    <span>{rung.weight}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="flex h-full min-w-0 flex-col gap-3">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-200/90">
              <LockKeyholeIcon className="size-4" />
              Read-only preview
            </div>
            <p className="mt-2 text-sm leading-6 text-amber-200/75">
              Range Ladder open and claim transactions are hidden until frontend
              config includes a deployed Range Ladder package ID.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/70 p-4 text-sm leading-6 text-muted-foreground">
            Claim consumes the owned RangeLadderPolicy and redeems every stored
            RangePosition. Manual same-range manager trades can block claim.
          </div>

          <Link
            className={cn(buttonVariants({ variant: "secondary" }), "justify-center")}
            to="/range-ladder/claims"
          >
            View Range Ladder claims
          </Link>
        </aside>
      </div>
    </main>
  )
}
