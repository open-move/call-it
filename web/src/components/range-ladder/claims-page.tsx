import { Layers3Icon, LockKeyholeIcon } from "lucide-react"

import { ProtectionFamilyHeader } from "@/components/protection/family-header"

const columns = ["Policy", "Rungs", "Bands", "Cost", "Status"]

export function Page() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <ProtectionFamilyHeader
        actions={[
          { href: "/range-ladder", label: "Range Ladder" },
          { href: "/protection", label: "Back to Protection" },
        ]}
        description="Read-only claims surface for future RangeLadderPolicy tickets. Active and claimable rows require package config and owned-object reads."
        title="Range Ladder Claims"
      />

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70">
          <div className="hidden grid-cols-[minmax(12rem,1.3fr)_5rem_minmax(10rem,1fr)_7rem_7rem] gap-4 border-b border-border/40 bg-muted/35 px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground md:grid">
            {columns.map((column) => (
              <span className={column === "Status" ? "text-right" : undefined} key={column}>
                {column}
              </span>
            ))}
          </div>

          <div className="flex min-h-72 flex-col items-center justify-center px-4 py-12 text-center">
            <div className="rounded-full border border-primary/30 bg-primary/10 p-3 text-primary">
              <Layers3Icon className="size-5" />
            </div>
            <div className="mt-4 text-sm font-medium text-foreground">
              No Range Ladder tickets yet
            </div>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Future rows will summarize rung count, bands, total cost, and
              active or claimable status. Claimed history must come from events
              because claim consumes the owned policy.
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
              This page does not query RangeLadderPolicy objects yet. Reads and
              claims stay disabled until deployment config is added.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/70 p-4 text-sm leading-6 text-muted-foreground">
            Every stored RangePosition must still match the manager&apos;s range
            position at claim time. Manual same-range trades can block claim.
          </div>
        </aside>
      </section>
    </main>
  )
}
