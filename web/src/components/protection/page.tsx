import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 py-3 last:border-b-0 last:pb-0">
      <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span className="max-w-[65%] text-right text-sm text-foreground">
        {value}
      </span>
    </div>
  )
}

export function Page() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-border/70 bg-card/80 p-6 sm:p-8">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            <ShieldCheckIcon className="size-3.5" />
            Protection
          </div>

          <div className="max-w-3xl space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              CallIt&apos;s policy product family.
            </h1>
            <p className="text-sm leading-6 text-muted-foreground sm:text-base">
              Protection is the umbrella product line. Shield is the first live
              implementation. The rest of the family extends the same policy
              model to standalone downside, range, and liquidation risk.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <article className="rounded-3xl border border-border/70 bg-card/70 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-500">
                Live now
              </div>
              <h2 className="text-2xl font-semibold text-foreground">Shield</h2>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Shield combines PLP yield with a downside hedge and wraps both
                legs into a policy object with a claim path.
              </p>
            </div>

            <Link
              className={cn(buttonVariants(), "flex items-center gap-2")}
              to="/shield"
            >
              Open Shield
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Construction
              </div>
              <div className="mt-2 text-sm text-foreground">
                PLP supply + DOWN hedge + policy
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Purpose
              </div>
              <div className="mt-2 text-sm text-foreground">
                Earn PLP yield while reserving part of the deposit for downside
                protection.
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-border/70 bg-card/70 p-6">
          <div className="text-sm font-medium text-foreground">Roadmap</div>
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
              <div className="text-sm font-medium text-foreground">
                1. Downside Protection
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Pure hedge policy for external spot or portfolio risk.
              </p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
              <div className="text-sm font-medium text-foreground">
                2. Range Shield
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Protection against price breaking into or out of a target range.
              </p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
              <div className="text-sm font-medium text-foreground">
                3. Margin Liquidation Shield
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Hedge near a liquidation band for external margin exposure.
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <div className="text-sm font-medium text-foreground">Model</div>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <div>Shield = PLP supply + DOWN hedge + policy</div>
            <div>Protection = Predict hedge + policy + external risk reference</div>
          </div>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <div className="text-sm font-medium text-foreground">
            Product codes
          </div>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">0</span> — Yield
              Shield
            </div>
            <div>
              <span className="font-medium text-foreground">1</span> —
              Standalone Downside Protection
            </div>
            <div>
              <span className="font-medium text-foreground">2</span> — Range
              Shield
            </div>
            <div>
              <span className="font-medium text-foreground">3</span> — Margin
              Liquidation Shield
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/70 p-5">
          <div className="text-sm font-medium text-foreground">
            Constraints
          </div>
          <div className="mt-1">
            <InfoRow
              label="Positions"
              value="Predict positions are not transferable."
            />
            <InfoRow
              label="Managers"
              value="PredictManager stays separate from spot and margin managers."
            />
            <InfoRow
              label="Withdrawals"
              value="Keeper settlement can fund the manager, but only the owner can withdraw."
            />
          </div>
        </article>
      </section>
    </main>
  )
}
