import { LockKeyholeIcon, TrendingDownIcon } from "lucide-react"

import { ProtectionFamilyHeader } from "@/components/protection/family-header"

const columns = ["Policy", "Premium", "Trigger", "Expiry", "Status"]

export function Page() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <ProtectionFamilyHeader
        actions={[
          { href: "/protect", label: "Protect" },
          { href: "/protection", label: "Back to Protection" },
        ]}
        description="Read-only claims surface for future Protect policies. Active and claimable rows will appear here after Protect package IDs and owned-policy reads are configured."
        title="Protect Claims"
      />

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70">
          <div className="hidden grid-cols-[minmax(12rem,1.4fr)_7rem_8rem_8rem_7rem] gap-4 border-b border-border/40 bg-muted/35 px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground md:grid">
            {columns.map((column) => (
              <span className={column === "Status" ? "text-right" : undefined} key={column}>
                {column}
              </span>
            ))}
          </div>

          <div className="flex min-h-72 flex-col items-center justify-center px-4 py-12 text-center">
            <div className="rounded-full border border-outcome-down/30 bg-outcome-down/10 p-3 text-outcome-down">
              <TrendingDownIcon className="size-5" />
            </div>
            <div className="mt-4 text-sm font-medium text-foreground">
              No live Protect tickets yet
            </div>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Protect claims will list wallet-owned ProtectionPolicy objects as
              active or claimable. Claimed history will need event-backed data
              because claim consumes the owned policy object.
            </p>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-200/90">
              <LockKeyholeIcon className="size-4" />
              Package config required
            </div>
            <p className="mt-2 text-sm leading-6 text-amber-200/75">
              This page does not query owned Protect objects yet. Live reads and
              claim actions stay disabled until the Protect package ID is added
              to frontend config.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/70 p-4 text-sm leading-6 text-muted-foreground">
            Manual trades on the same manager, oracle, expiry, strike, and side
            can change the reserved hedge position and block a future claim.
          </div>
        </aside>
      </section>
    </main>
  )
}
