import { ArrowLeftIcon, LockKeyholeIcon, TrendingDownIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { ProtectionFamilyHeader } from "@/components/protection/family-header"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const previewRows = [
  { label: "Direction", value: "DOWN hedge" },
  { label: "Trigger", value: "Selected strike" },
  { label: "Premium", value: "DUSDC payment" },
  { label: "Claim", value: "After settlement" },
]

const flowRows = [
  {
    label: "Open",
    value:
      "User pays premium and receives an owned ProtectionPolicy in their wallet.",
  },
  {
    label: "Reserve",
    value:
      "The policy reserves a Predict manager position for one oracle, expiry, strike, and side.",
  },
  {
    label: "Claim",
    value:
      "Claim consumes the policy by value and returns the DUSDC payout coin.",
  },
]

export function Page() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <ProtectionFamilyHeader
        actions={[{ href: "/protection", label: "Back to Protection" }]}
        description="Product 1 · pure hedge ticket. Protect removes PLP/yield mechanics and focuses on one directional Predict position wrapped as an owned policy."
        title="Protect"
      />

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <article className="overflow-hidden rounded-2xl border border-border/70 bg-card/70">
          <div className="grid min-h-80 md:grid-cols-[4.5rem_minmax(0,1fr)]">
            <div className="flex flex-row items-center justify-between border-b border-border/50 bg-background/45 px-4 py-3 md:flex-col md:border-r md:border-b-0">
              <span className="font-mono text-[11px] text-muted-foreground">
                01
              </span>
              <div className="flex items-center gap-1 md:flex-col">
                {Array.from({ length: 5 }).map((_, index) => (
                  <span
                    className={cn(
                      "block size-2 rounded-full border border-border",
                      index === 2 ? "bg-outcome-down" : "bg-muted/60"
                    )}
                    key={index}
                  />
                ))}
              </div>
              <span className="font-mono text-[11px] text-outcome-down">
                DOWN
              </span>
            </div>

            <div className="flex flex-col justify-between gap-8 p-5 sm:p-6">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-md border border-outcome-down/30 bg-outcome-down/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-outcome-down">
                  <TrendingDownIcon className="size-3.5" />
                  Standalone hedge
                </div>
                <div className="max-w-2xl space-y-2">
                  <h1 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
                    Protection without the yield leg.
                  </h1>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Protect is modeled as a premium-paid policy over one Predict
                    market key. No PLP supply, no yield accounting, no payout
                    multiplier display.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                {previewRows.map((row) => (
                  <div
                    className="rounded-md border border-border/55 bg-background/45 px-3 py-2"
                    key={row.label}
                  >
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {row.label}
                    </div>
                    <div className="mt-1 font-mono text-xs text-foreground">
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>

        <aside className="flex flex-col gap-3">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-200/90">
              <LockKeyholeIcon className="size-4" />
              Transaction wiring disabled
            </div>
            <p className="mt-2 text-sm leading-6 text-amber-200/75">
              Protect package IDs are not configured on this frontend yet, so
              this page is a read-only design slice. Live open and claim actions
              stay hidden until deployment config exists.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <div className="text-sm font-medium text-foreground">
              Owned-ticket flow
            </div>
            <div className="mt-3 space-y-3">
              {flowRows.map((row) => (
                <div
                  className="border-b border-border/35 pb-3 last:border-b-0 last:pb-0"
                  key={row.label}
                >
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {row.label}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {row.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <Link
            className={cn(buttonVariants({ variant: "ghost" }), "justify-start gap-2")}
            to="/protection"
          >
            <ArrowLeftIcon className="size-4" />
            Protection family
          </Link>
        </aside>
      </section>
    </main>
  )
}
