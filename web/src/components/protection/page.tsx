import { Link } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  Layers3Icon,
  ShieldCheckIcon,
  TrendingDownIcon,
} from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const products = [
  {
    code: "00",
    description:
      "Deposit DUSDC into Predict PLP and reserve part of the ticket for a DOWN hedge.",
    href: "/shield",
    icon: ShieldCheckIcon,
    label: "Live",
    name: "Shield",
    tone: "text-emerald-500",
  },
  {
    code: "01",
    description:
      "Standalone downside hedge ticket for a selected oracle, strike, and expiry.",
    icon: TrendingDownIcon,
    label: "Pending package",
    name: "Protect",
    tone: "text-muted-foreground",
  },
  {
    code: "02",
    description:
      "Multi-rung range ticket for markets where payout depends on a price band.",
    icon: Layers3Icon,
    label: "Pending package",
    name: "Range Ladder",
    tone: "text-muted-foreground",
  },
]

export function Page() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-border/70 bg-card/75 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheckIcon className="size-3.5" />
              Protection
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
              Owned policy tickets for Predict risk.
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Shield is live. Protect and Range Ladder use the same owned-ticket
              claim model, but stay disabled here until their package IDs and
              routes are configured.
            </p>
          </div>

          <Link
            className={cn(buttonVariants({ variant: "secondary" }), "gap-2")}
            to="/shield/claims"
          >
            Shield claims
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {products.map((product) => {
          const Icon = product.icon
          const card = (
            <article className="flex h-full min-h-56 flex-col justify-between rounded-2xl border border-border/70 bg-card/70 p-4 transition-colors hover:border-border">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {product.code}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] uppercase tracking-[0.16em]",
                      product.tone
                    )}
                  >
                    {product.label}
                  </span>
                </div>

                <div className="space-y-2">
                  <Icon className={cn("size-5", product.tone)} />
                  <h2 className="text-lg font-medium text-foreground">
                    {product.name}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {product.description}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
                <span>Owned policy</span>
                <span>{product.href ? "Open" : "Configured later"}</span>
              </div>
            </article>
          )

          if (!product.href) {
            return <div key={product.name}>{card}</div>
          }

          return (
            <Link key={product.name} to={product.href}>
              {card}
            </Link>
          )
        })}
      </section>

      <section className="grid gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 text-sm text-muted-foreground md:grid-cols-3">
        <div>
          <div className="mb-1 text-xs uppercase tracking-[0.16em] text-foreground">
            Ticket
          </div>
          Open returns an owned policy object to the wallet.
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-[0.16em] text-foreground">
            Claim
          </div>
          Claim consumes the policy after the underlying Predict market settles.
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-[0.16em] text-foreground">
            Collision Risk
          </div>
          Manual trades on the same manager and market key can break reserved
          product positions.
        </div>
      </section>
    </main>
  )
}
