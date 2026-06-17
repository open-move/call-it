import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Layers3Icon,
  LockKeyholeIcon,
} from "lucide-react"

import { ProtectionFamilyHeader } from "@/components/protection/family-header"
import { AssetIcon } from "@/components/shared/market/asset-icon"
import { buttonVariants } from "@/components/ui/button"
import { formatExpiryDistance, formatSignedPercent, formatUsd } from "@/lib/format"
import { getRangeLadderPresetLabel } from "@/lib/range-ladder-products"
import type { RangeLadderProduct } from "@/lib/types/range-ladder"
import { cn } from "@/lib/utils"

const sampleRungs = [
  { band: "$92k - $96k", cost: "low", weight: "1.0x" },
  { band: "$88k - $92k", cost: "mid", weight: "1.5x" },
  { band: "$80k - $88k", cost: "high", weight: "2.0x" },
]

const terms = [
  "Open returns one owned RangeLadderPolicy to the wallet.",
  "Each rung stores a RangeKey, quantity, and cost.",
  "Claim consumes the policy and redeems every stored range position.",
  "Manual same-range manager trades can block claim.",
]

export interface PageProps {
  products: RangeLadderProduct[]
}

function getRangeLadderProductSearch(product: RangeLadderProduct) {
  return {
    preset: product.preset,
  }
}

export function Page({ products }: PageProps) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <ProtectionFamilyHeader
        actions={[
          { href: "/range-ladder/claims", label: "Claims" },
          { href: "/protection", label: "Back to Protection" },
        ]}
        description="Product 2 · multi-band range ticket. Range Ladder is a read-only design slice until package IDs are configured."
        title="Range Ladder"
      />

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-primary">
                <Layers3Icon className="size-3.5" />
                Rung builder preview
              </div>
              <h1 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
                Stack range bands into one owned claim ticket.
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Range Ladder is not a table clone of Shield. The product shape is
                a rail of bands, where each rung reserves a range position and
                the final policy claims all rungs together after settlement.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 md:w-72">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-200/90">
                <LockKeyholeIcon className="size-4" />
                Read-only
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-200/75">
                Live builder, object reads, and claim actions stay hidden until
                Range Ladder package config exists.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border/60 bg-background/40 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-foreground">
                Example ladder rail
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                3 rungs
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              {sampleRungs.map((rung, index) => (
                <div
                  className="relative rounded-md border border-border/60 bg-card/70 p-3"
                  key={rung.band}
                >
                  <div className="absolute top-3 right-3 font-mono text-[10px] text-muted-foreground">
                    0{index + 1}
                  </div>
                  <div className="font-mono text-sm text-foreground">
                    {rung.band}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Cost {rung.cost}</span>
                    <span>{rung.weight}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <div className="text-sm font-medium text-foreground">
              Contract-aligned terms
            </div>
            <div className="mt-3 space-y-3">
              {terms.map((term) => (
                <div
                  className="border-b border-border/35 pb-3 text-sm leading-6 text-muted-foreground last:border-b-0 last:pb-0"
                  key={term}
                >
                  {term}
                </div>
              ))}
            </div>
          </div>

          <Link
            className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
            to="/range-ladder/claims"
          >
            Range Ladder claims
          </Link>
          <Link
            className={cn(buttonVariants({ variant: "ghost" }), "w-full gap-2")}
            to="/protection"
          >
            <ArrowLeftIcon className="size-4" />
            Protection family
          </Link>
        </aside>
      </section>

      <section className="space-y-3 rounded-2xl border border-border/70 bg-card/60 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">
              Suggested ladders
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Read-only rung presets built from active Predict markets. Live
              premium quotes remain disabled until Range Ladder config exists.
            </p>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {products.length} previews
          </span>
        </div>

        {products.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <Link
                className="group rounded-md border border-border/60 bg-background/45 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                key={product.id}
                params={{ oracleId: product.market.oracleId }}
                search={getRangeLadderProductSearch(product)}
                to="/range-ladder/$oracleId"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AssetIcon
                      assetIconUrl={product.market.assetIconUrl}
                      assetName={product.market.assetName}
                      assetSymbol={product.market.assetSymbol}
                      className="size-6"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                        {product.market.assetSymbol} Ladder
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {getRangeLadderPresetLabel(product.preset)} · {product.rungs.length} rungs
                      </div>
                    </div>
                  </div>
                  <ArrowRightIcon className="mt-1 size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <PreviewMetric
                    label="First band"
                    value={`${formatUsd(product.rungs[0]?.lowerStrikeUsd ?? 0, 0)} - ${formatUsd(product.rungs[0]?.higherStrikeUsd ?? 0, 0)}`}
                  />
                  <PreviewMetric
                    label="Deepest"
                    tone="down"
                    value={formatSignedPercent(product.distancePercent)}
                  />
                  <PreviewMetric
                    label="Expires"
                    value={formatExpiryDistance(product.market.expiryMs)}
                  />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-border/50 bg-background/45 px-4 py-10 text-center text-sm text-muted-foreground">
            No active Range Ladder previews are available.
          </div>
        )}
      </section>
    </main>
  )
}

function PreviewMetric({
  label,
  tone,
  value,
}: {
  label: string
  tone?: "down"
  value: string
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-xs tabular-nums text-foreground",
          tone === "down" && "text-outcome-down"
        )}
      >
        {value}
      </div>
    </div>
  )
}
