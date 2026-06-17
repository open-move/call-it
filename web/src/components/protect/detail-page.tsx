import { Link } from "@tanstack/react-router"
import { LockKeyholeIcon, TrendingDownIcon } from "lucide-react"

import { BadgeTone } from "@/components/primitives/badge"
import { ProtectionFamilyHeader } from "@/components/protection/family-header"
import { DetailChartCard } from "@/components/shared/detail/detail-chart-card"
import { buttonVariants } from "@/components/ui/button"
import { formatExpiryDistance, formatSignedPercent, formatUsd } from "@/lib/format"
import { getProtectPresetLabel } from "@/lib/protect-products"
import type { ExpiryOption } from "@/lib/types/market"
import type { ProtectProduct } from "@/lib/types/protect"
import { cn } from "@/lib/utils"

export interface DetailPageProps {
  expiryProducts: ProtectProduct[]
  product: ProtectProduct
}

function getProtectProductHref(product: ProtectProduct) {
  const searchParams = new URLSearchParams({
    preset: product.preset,
    strike: product.triggerStrikeUsd.toString(),
  })

  return `/protect/${product.market.oracleId}?${searchParams.toString()}`
}

function getProtectExpiryOptions(products: ProtectProduct[]): ExpiryOption[] {
  return products.map((product) => ({
    assetSymbol: product.market.assetSymbol,
    expiryMs: product.market.expiryMs,
    oracleId: product.market.oracleId,
    status: product.market.status,
  }))
}

export function DetailPage({ expiryProducts, product }: DetailPageProps) {
  const expiryOptions = getProtectExpiryOptions(expiryProducts)

  return (
    <main className="mx-auto w-full max-w-384 px-4 py-4 sm:px-6 lg:px-8">
      <div className="mb-3">
        <ProtectionFamilyHeader
          actions={[
            { href: "/protect/claims", label: "Claims" },
            { href: "/protect", label: "All Protect" },
          ]}
          description={`Product 1 · pure ${product.market.assetSymbol} DOWN hedge preview below ${formatUsd(product.triggerStrikeUsd, 0)}. Transaction wiring remains disabled until Protect package IDs are configured.`}
          title="Protect"
        />
      </div>

      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="h-120 min-w-0">
          <DetailChartCard
            assetIconUrl={product.market.assetIconUrl}
            assetName={product.market.assetName}
            assetSymbol={product.market.assetSymbol}
            badgeLabel="Preview"
            badgeTone={BadgeTone.Neutral}
            expiryOptions={expiryOptions}
            getExpiryHref={(option) =>
              getProtectProductHref(
                expiryProducts.find(
                  (expiryProduct) =>
                    expiryProduct.market.oracleId === option.oracleId
                ) ?? product
              )
            }
            metrics={[
              { label: "Direction", value: "DOWN" },
              {
                className: "text-outcome-down",
                label: "Trigger",
                value: `Below ${formatUsd(product.triggerStrikeUsd, 0)}`,
              },
              {
                className: "text-outcome-down",
                label: "Distance",
                value: formatSignedPercent(product.distancePercent),
              },
              {
                label: "Preset",
                value: getProtectPresetLabel(product.preset),
              },
              {
                label: "Expires",
                value: formatExpiryDistance(product.market.expiryMs),
              },
            ]}
            points={product.market.priceHistory}
            referenceLabel="Trigger"
            referencePriceUsd={product.triggerStrikeUsd}
            selectedOracleId={product.market.oracleId}
            title={`${product.market.assetSymbol} Protect · ${getProtectPresetLabel(product.preset)}`}
          />
        </section>

        <aside className="flex h-full min-w-0 flex-col gap-3">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-200/90">
              <LockKeyholeIcon className="size-4" />
              Read-only preview
            </div>
            <p className="mt-2 text-sm leading-6 text-amber-200/75">
              Protect open and claim transactions are intentionally hidden until
              frontend config includes a deployed Protect package ID.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <TrendingDownIcon className="size-4 text-outcome-down" />
              Future ticket terms
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              <p>Premium paid in DUSDC for one reserved DOWN hedge.</p>
              <p>Owned ProtectionPolicy transfers to the wallet on open.</p>
              <p>Claim consumes the policy after Predict settlement.</p>
              <p>Manual same-key manager trades can block claim.</p>
            </div>
          </div>

          <Link
            className={cn(buttonVariants({ variant: "secondary" }), "justify-center")}
            to="/protect/claims"
          >
            View Protect claims
          </Link>
        </aside>
      </div>
    </main>
  )
}
