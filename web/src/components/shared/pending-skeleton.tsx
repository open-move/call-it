import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function PulsingBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse bg-muted/50", className)}
    />
  )
}

function PulsingRow({ columns, count }: { columns: string; count: number }) {
  return (
    <div className={cn("grid items-center gap-4 px-3 py-2.5", columns)}>
      {Array.from({ length: count }).map((_, i) => (
        <PulsingBlock key={i} className="h-3 rounded" />
      ))}
    </div>
  )
}

const marketsTableColumns =
  "grid-cols-[minmax(15rem,1.5fr)_7rem_0.6fr_0.7fr_0.75fr_0.75fr_7rem]"

export function MarketsSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="flex flex-col gap-5 lg:gap-6">
          {/* Featured: top markets + prediction activity */}
          <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.58fr)]">
            <div className="flex flex-col rounded-xl bg-card p-3">
              {/* header: size-3.5 icon + text-sm leading-none label */}
              <div className="mb-2 flex items-center gap-1.5">
                <Skeleton className="size-3.5" />
                <Skeleton className="h-3.5 w-24" />
              </div>

              {/* rows: two-line identity (leading-5 + leading-4) + two-line prob.
                  getTopMarkets() returns 3, so match that exactly. */}
              <div className="space-y-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    className="grid grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-2.5 px-2 py-1.5"
                    key={i}
                  >
                    <Skeleton className="mx-auto size-3" />
                    <Skeleton className="size-6 rounded-full" />
                    <div className="min-w-0">
                      <div className="flex h-5 items-center">
                        <Skeleton className="h-3 w-44 max-w-full" />
                      </div>
                      <div className="flex h-4 items-center">
                        <Skeleton className="h-2.5 w-28" />
                      </div>
                    </div>
                    <div>
                      <div className="flex h-5 items-center justify-end">
                        <Skeleton className="h-3 w-12" />
                      </div>
                      <div className="flex h-4 items-center justify-end">
                        <Skeleton className="h-2.5 w-10" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* footer: single text-[11px] line */}
              <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-2.5">
                <div className="flex h-4 items-center">
                  <Skeleton className="h-2.5 w-28" />
                </div>
                <div className="flex h-4 items-center">
                  <Skeleton className="h-2.5 w-12" />
                </div>
              </div>
            </div>

            <div className="flex flex-col rounded-xl bg-card p-4">
              <div className="flex flex-1 flex-col gap-2.5">
                {/* header */}
                <div className="flex items-center gap-1.5">
                  <Skeleton className="size-3.5" />
                  <Skeleton className="h-3.5 w-32" />
                </div>

                {/* recent volume: text-xs label + text-lg leading-none value */}
                <div>
                  <div className="flex h-4 items-center">
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                  <div className="mt-1 flex h-[18px] items-center">
                    <Skeleton className="h-4 w-28" />
                  </div>
                </div>

                {/* sparkline */}
                <Skeleton className="h-12 w-full" />

                {/* 3 stats: text-xs label + text-sm value */}
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i}>
                      <div className="flex h-4 items-center">
                        <Skeleton className="h-2.5 w-10" />
                      </div>
                      <div className="mt-1 flex h-5 items-center">
                        <Skeleton className="h-3.5 w-12" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* next-expiry link: text-xs line, pinned to the bottom */}
                <div className="mt-auto flex h-4 items-center pt-1">
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            </div>
          </div>

          {/* Filters + table */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-nowrap items-center gap-1.5 overflow-hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-14 shrink-0" />
                ))}
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Skeleton className="h-8 min-w-0 flex-1 sm:w-72 sm:flex-none" />
                <Skeleton className="h-8 w-20 shrink-0" />
                <Skeleton className="size-8 shrink-0" />
              </div>
            </div>

            <div className="overflow-hidden rounded-lg bg-transparent lg:bg-card">
              {/* Desktop header */}
              <div
                className={cn(
                  "hidden border-b border-border/35 bg-muted/25 px-3 py-2 lg:grid lg:items-center",
                  marketsTableColumns
                )}
              >
                {Array.from({ length: 7 }).map((_, i) =>
                  i === 1 ? (
                    <div key={i} />
                  ) : (
                    <Skeleton
                      key={i}
                      className={cn("h-2.5 w-12", i > 1 && "ml-auto")}
                    />
                  )
                )}
              </div>

              {/* Desktop rows */}
              <div className="hidden lg:block">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    className={cn(
                      "grid min-h-[3.75rem] items-center border-b border-border/25 px-3 py-2.5 last:border-b-0",
                      marketsTableColumns
                    )}
                    key={i}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Skeleton className="size-6 shrink-0 rounded-full" />
                      <Skeleton className="h-3 w-44 max-w-full" />
                    </div>
                    <div className="pl-3">
                      <Skeleton className="h-7 w-full" />
                    </div>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <Skeleton key={j} className="ml-auto h-3 w-12" />
                    ))}
                    <div className="flex justify-end pl-3">
                      <Skeleton className="h-8 w-18" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 lg:hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div className="space-y-2 rounded-lg bg-card p-3" key={i}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Skeleton className="size-6 shrink-0 rounded-full" />
                        <Skeleton className="h-3 w-40 max-w-full" />
                      </div>
                      <Skeleton className="ml-auto h-3 w-12" />
                    </div>

                    <Skeleton className="h-7 w-full" />

                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                      {Array.from({ length: 4 }).map((__, j) => (
                        <Skeleton key={j} className="h-3 w-16" />
                      ))}
                    </div>

                    <Skeleton className="h-8 w-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export function MarketDetailSkeleton() {
  return (
    <main className="mx-auto w-full max-w-384 px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,7fr)_minmax(0,2.5fr)] xl:items-stretch">
          <div className="h-[28rem] min-w-0 xl:h-[min(34rem,calc(100vh-9rem))]">
            <div className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-lg border-0 bg-card py-0 shadow-none ring-0">
              <div className="border-b border-border/40">
                <div className="flex min-w-0 flex-col gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <PulsingBlock className="size-5 rounded-full" />
                      <PulsingBlock className="h-4 w-36 rounded" />
                      <PulsingBlock className="size-3 rounded" />
                    </div>
                    <PulsingBlock className="h-4 w-16 rounded" />
                  </div>
                  <div className="overflow-x-auto pb-1">
                    <div className="flex min-w-150 items-end gap-6">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="min-w-0 space-y-1">
                          <PulsingBlock className="h-2.5 w-10 rounded" />
                          <PulsingBlock className="h-3.5 w-14 rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-b border-border/30 bg-background/25 px-3 py-2">
                <div className="flex min-w-0 gap-1.5 overflow-x-auto">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border/45 bg-muted/30 px-2.5"
                    >
                      <PulsingBlock className="size-1.5 rounded-full" />
                      <PulsingBlock className="h-2.5 w-12 rounded" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative min-h-0 w-full flex-1">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <PulsingBlock className="h-32 w-72 rounded-md" />
                    <PulsingBlock className="h-3 w-48 rounded" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="h-[22rem] min-w-0 xl:h-[min(34rem,calc(100vh-9rem))]">
            <div className="flex h-full w-full flex-col gap-4 rounded-lg border-0 bg-card py-0 shadow-none ring-0">
              <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2.5">
                <PulsingBlock className="h-3.5 w-12 rounded" />
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="min-w-[24rem]">
                  <div className="grid grid-cols-[minmax(0,1fr)_3rem_4.75rem] gap-2 px-2 pb-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <PulsingBlock key={i} className="h-2.5 rounded" />
                    ))}
                  </div>
                  <div className="space-y-px">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[minmax(0,1fr)_3rem_4.75rem] gap-2 px-2 py-1.5"
                      >
                        <PulsingBlock className="h-2.5 w-3/4 rounded" />
                        <PulsingBlock className="h-2.5 rounded" />
                        <PulsingBlock className="h-2.5 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="h-[24rem] min-w-0 xl:col-span-2">
            <div className="flex h-full flex-col rounded-lg border-0 bg-card py-0 shadow-none ring-0">
              <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/45 px-3">
                <div className="flex h-full w-full items-center gap-6 overflow-x-auto">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <PulsingBlock
                      key={i}
                      className="h-4 w-16 shrink-0 rounded"
                    />
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                <div className="min-w-[54rem]">
                  <div className="grid grid-cols-[minmax(13rem,1.8fr)_5.25rem_7rem_6.5rem_minmax(7rem,1fr)_5.5rem] gap-4 bg-muted/45 px-3 py-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <PulsingBlock key={i} className="h-2.5 rounded" />
                    ))}
                  </div>
                  <div className="space-y-0">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <PulsingRow
                        key={i}
                        count={6}
                        columns="grid-cols-[minmax(13rem,1.8fr)_5.25rem_7rem_6.5rem_minmax(7rem,1fr)_5.5rem]"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="h-full min-w-0 xl:sticky xl:top-[4.25rem] xl:self-start">
          <div className="flex h-full w-full flex-col gap-2">
            <div className="w-full overflow-hidden rounded-md bg-muted/25 p-0">
              <div className="grid grid-cols-2 gap-0">
                {Array.from({ length: 2 }).map((_, i) => (
                  <PulsingBlock key={i} className="h-9 rounded-none" />
                ))}
              </div>
            </div>
            <div className="flex w-full flex-1 flex-col gap-3 rounded-md border-0 bg-card px-3 py-3 shadow-none ring-0">
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <PulsingBlock key={i} className="h-18 rounded-md" />
                ))}
              </div>
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <PulsingBlock className="h-2.5 w-20 rounded" />
                    <PulsingBlock className="h-9 w-full rounded-md" />
                  </div>
                ))}
              </div>
              <div className="space-y-2 rounded-md bg-muted p-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4"
                  >
                    <PulsingBlock className="h-2.5 w-12 rounded" />
                    <PulsingBlock className="h-3 w-16 rounded" />
                  </div>
                ))}
              </div>
              <PulsingBlock className="h-10 w-full rounded-md" />
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

export function ShieldSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        {/* Hero */}
        <div className="mx-auto w-full max-w-5xl p-4">
          <PulsingBlock className="h-4 w-24 rounded" />
          <PulsingBlock className="mt-2 h-3 w-80 max-w-full rounded" />
        </div>

        {/* Position panel + strategy overview */}
        <div className="mx-auto grid max-w-5xl items-stretch gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              className="flex h-full flex-col gap-4 rounded-lg bg-card p-4"
              key={i}
            >
              <PulsingBlock className="h-3.5 w-32 rounded" />
              <div className="space-y-1.5">
                <PulsingBlock className="h-2.5 w-24 rounded" />
                <PulsingBlock className="h-7 w-36 rounded" />
              </div>
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((__, j) => (
                  <div
                    className="flex items-center justify-between gap-4"
                    key={j}
                  >
                    <PulsingBlock className="h-3 w-20 rounded" />
                    <PulsingBlock className="h-3 w-16 rounded" />
                  </div>
                ))}
              </div>
              <PulsingBlock className="mt-auto h-9 w-full rounded-md" />
            </div>
          ))}
        </div>

        {/* Round progress + policy */}
        <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              className="flex h-full flex-col gap-4 rounded-lg bg-card p-4"
              key={i}
            >
              <PulsingBlock className="h-3.5 w-28 rounded" />
              <PulsingBlock className="h-2 w-full rounded-full" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div
                    className="flex items-center justify-between gap-4"
                    key={j}
                  >
                    <PulsingBlock className="h-3 w-24 rounded" />
                    <PulsingBlock className="h-3 w-16 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export function ShieldDetailSkeleton() {
  return (
    <main className="mx-auto w-full max-w-384 px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="grid min-w-0 gap-3">
          <div className="h-120 min-w-0">
            <div className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-lg border-0 bg-card py-0 shadow-none ring-0">
              <div className="border-b border-border/40">
                <div className="flex min-w-0 flex-col gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <PulsingBlock className="size-5 rounded-full" />
                      <PulsingBlock className="h-4 w-36 rounded" />
                      <PulsingBlock className="size-3 rounded" />
                    </div>
                    <PulsingBlock className="h-4 w-16 rounded" />
                  </div>
                  <div className="overflow-x-auto pb-1">
                    <div className="flex min-w-150 items-end gap-6">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="min-w-0 space-y-1">
                          <PulsingBlock className="h-2.5 w-10 rounded" />
                          <PulsingBlock className="h-3.5 w-14 rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-b border-border/30 bg-background/25 px-3 py-2">
                <div className="flex min-w-0 gap-1.5 overflow-x-auto">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border/45 bg-muted/30 px-2.5"
                    >
                      <PulsingBlock className="size-1.5 rounded-full" />
                      <PulsingBlock className="h-2.5 w-12 rounded" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative min-h-0 w-full flex-1">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <PulsingBlock className="h-32 w-72 rounded-md" />
                    <PulsingBlock className="h-3 w-48 rounded" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="h-[24rem] min-w-0">
            <div className="flex h-full flex-col rounded-lg border-0 bg-card py-0 shadow-none ring-0">
              <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/45 px-3">
                <div className="flex h-full w-full items-center gap-6 overflow-x-auto">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <PulsingBlock
                      key={i}
                      className="h-4 w-16 shrink-0 rounded"
                    />
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                <div className="min-w-[52rem]">
                  <div className="grid grid-cols-[minmax(12rem,1.8fr)_7rem_6rem_6rem_7rem_7rem_5.5rem] gap-4 bg-muted/45 px-3 py-2">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <PulsingBlock key={i} className="h-2.5 rounded" />
                    ))}
                  </div>
                  <div className="space-y-0">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <PulsingRow
                        key={i}
                        count={7}
                        columns="grid-cols-[minmax(12rem,1.8fr)_7rem_6rem_6rem_7rem_7rem_5.5rem]"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="h-full min-w-0">
          <div className="flex h-full w-full flex-col gap-2">
            <div className="flex w-full flex-1 flex-col gap-3 rounded-md border-0 bg-card px-3 py-3 shadow-none ring-0">
              <div className="flex items-center gap-2">
                <PulsingBlock className="size-5 rounded" />
                <PulsingBlock className="h-4 w-20 rounded" />
              </div>
              <div className="space-y-1.5">
                <PulsingBlock className="h-2.5 w-16 rounded" />
                <PulsingBlock className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-2 rounded-md bg-muted p-2.5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4"
                  >
                    <PulsingBlock className="h-2.5 w-12 rounded" />
                    <PulsingBlock className="h-3 w-20 rounded" />
                  </div>
                ))}
              </div>
              <PulsingBlock className="h-10 w-full rounded-md" />
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

export function PortfolioSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
          <div className="gap-0 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
            <div className="border-b border-border/45 px-4 py-3">
              <PulsingBlock className="h-4 w-24 rounded" />
            </div>
            <div className="grid gap-4 px-4 py-4">
              <div className="space-y-2">
                <PulsingBlock className="h-8 w-48 rounded" />
                <PulsingBlock className="h-3 w-32 rounded" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="min-w-0 rounded-md bg-muted/25 px-2.5 py-2"
                  >
                    <PulsingBlock className="h-2.5 w-14 rounded" />
                    <PulsingBlock className="mt-1 h-3.5 w-20 rounded" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PulsingBlock className="h-9 rounded-md" />
                <PulsingBlock className="h-9 rounded-md" />
              </div>
            </div>
          </div>

          <div className="min-h-[17rem] gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
            <div className="flex items-center justify-between gap-3 border-b border-border/45 px-4 py-3">
              <div className="flex gap-5">
                <PulsingBlock className="h-3 w-20 rounded" />
                <PulsingBlock className="h-3 w-16 rounded" />
              </div>
              <div className="hidden gap-1 sm:flex">
                {Array.from({ length: 4 }).map((_, i) => (
                  <PulsingBlock key={i} className="h-7 w-10 rounded-md" />
                ))}
              </div>
            </div>
            <div className="grid min-h-52 place-items-center px-4 py-3">
              <PulsingBlock className="h-40 w-full max-w-2xl rounded-md" />
            </div>
          </div>
        </div>

        <div className="min-h-96 overflow-hidden rounded-lg border-0 bg-card py-0 shadow-none ring-0">
          <div className="flex flex-col gap-3 border-b border-border/45 px-4 py-3 lg:h-11 lg:flex-row lg:items-center lg:justify-between lg:py-0">
            <div className="flex gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <PulsingBlock key={i} className="h-3 w-20 rounded" />
              ))}
            </div>
            <PulsingBlock className="h-8 w-full rounded-md lg:w-72" />
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block">
            <div className="min-w-[56rem]">
              <div className="grid grid-cols-[minmax(13rem,1.8fr)_7rem_5.25rem_5.25rem_6.5rem_6.5rem_5.5rem] gap-4 bg-muted/45 px-3 py-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <PulsingBlock key={i} className="h-2.5 rounded" />
                ))}
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(13rem,1.8fr)_7rem_5.25rem_5.25rem_6.5rem_6.5rem_5.5rem] gap-4 border-b border-border/30 px-3 py-2.5"
                >
                  {Array.from({ length: 7 }).map((__, j) => (
                    <PulsingBlock key={j} className="h-3 rounded" />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 p-3 lg:hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div className="space-y-2 rounded-md bg-muted/25 p-3" key={i}>
                <div className="flex items-center justify-between gap-3">
                  <PulsingBlock className="h-3 w-36 rounded" />
                  <PulsingBlock className="h-3 w-16 rounded" />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {Array.from({ length: 4 }).map((__, j) => (
                    <PulsingBlock key={j} className="h-3 w-20 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

export function EarnSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        {/* Hero */}
        <div className="mx-auto w-full max-w-5xl p-4">
          <PulsingBlock className="h-4 w-28 rounded" />
          <PulsingBlock className="mt-2 h-3 w-80 max-w-full rounded" />
        </div>

        {/* Liquidity panel + vault stats */}
        <div className="mx-auto grid max-w-5xl items-stretch gap-3 lg:grid-cols-2">
          <div className="flex h-full flex-col gap-4 rounded-lg bg-card p-4">
            <PulsingBlock className="h-3.5 w-28 rounded" />
            <div className="space-y-1.5">
              <PulsingBlock className="h-2.5 w-16 rounded" />
              <PulsingBlock className="h-9 w-full rounded-md" />
            </div>
            <div className="space-y-2 rounded-md bg-muted/25 p-2.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  className="flex items-center justify-between gap-4"
                  key={i}
                >
                  <PulsingBlock className="h-3 w-20 rounded" />
                  <PulsingBlock className="h-3 w-16 rounded" />
                </div>
              ))}
            </div>
            <PulsingBlock className="mt-auto h-9 w-full rounded-md" />
          </div>

          <div className="flex h-full flex-col gap-4 rounded-lg bg-card p-4">
            <PulsingBlock className="h-3.5 w-24 rounded" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div className="space-y-1.5" key={i}>
                  <PulsingBlock className="h-2.5 w-14 rounded" />
                  <PulsingBlock className="h-7 w-24 rounded" />
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-border/40 pt-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  className="flex items-center justify-between gap-4"
                  key={i}
                >
                  <PulsingBlock className="h-3 w-20 rounded" />
                  <PulsingBlock className="h-3 w-16 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity card */}
        <div className="mx-auto max-w-5xl">
          <div className="rounded-lg bg-card">
            <div className="px-3 py-2.5">
              <PulsingBlock className="h-3.5 w-24 rounded" />
            </div>
            <div className="hidden border-b border-border/40 px-3 py-2 md:grid md:grid-cols-[0.9fr_0.65fr_0.9fr_1fr_1fr_0.7fr] md:gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <PulsingBlock key={i} className="h-2.5 rounded" />
              ))}
            </div>
            <div className="divide-y divide-border/25">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  className="grid grid-cols-2 gap-1.5 px-3 py-2.5 md:grid-cols-[0.9fr_0.65fr_0.9fr_1fr_1fr_0.7fr] md:items-center md:gap-4"
                  key={i}
                >
                  {Array.from({ length: 6 }).map((__, j) => (
                    <PulsingBlock key={j} className="h-3 rounded" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export function RiskSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="rounded-lg bg-card px-4 py-3 shadow-none ring-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <PulsingBlock className="h-4 w-28 rounded" />
                <PulsingBlock className="h-4 w-20 rounded" />
                <PulsingBlock className="h-4 w-20 rounded" />
              </div>
              <PulsingBlock className="h-3.5 w-96 max-w-full rounded" />
              <PulsingBlock className="h-2.5 w-72 max-w-full rounded" />
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <PulsingBlock key={i} className="h-7 w-16 rounded-md" />
                ))}
              </div>
              <PulsingBlock className="h-9 w-full rounded-md sm:w-40" />
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border-0 bg-card py-0 shadow-none ring-0">
          <div className="grid border-b border-border/45 bg-muted/10 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                className="border-b border-border/35 px-3 py-2.5 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0"
                key={i}
              >
                <PulsingBlock className="h-3 w-24 rounded" />
                <PulsingBlock className="mt-2 h-4 w-28 rounded" />
                <PulsingBlock className="mt-1 h-2.5 w-20 rounded" />
              </div>
            ))}
          </div>

          <div className="grid min-h-[34rem] gap-0 xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
            <div className="border-b border-border/45 xl:border-r xl:border-b-0">
              <div className="border-b border-border/35 px-3 py-3">
                <PulsingBlock className="h-4 w-28 rounded" />
                <div className="mt-3 flex gap-1.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <PulsingBlock key={i} className="h-7 w-14 rounded-md" />
                  ))}
                </div>
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border-b border-border/30 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <PulsingBlock className="h-3 w-20 rounded" />
                    <PulsingBlock className="h-3 w-10 rounded" />
                  </div>
                  <PulsingBlock className="mt-2 h-1 rounded-full" />
                  <PulsingBlock className="mt-2 h-2.5 w-32 rounded" />
                </div>
              ))}
            </div>

            <div className="px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <PulsingBlock className="h-4 w-24 rounded" />
                  <PulsingBlock className="h-3 w-80 max-w-full rounded" />
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <PulsingBlock key={i} className="h-7 w-16 rounded-md" />
                  ))}
                </div>
              </div>
              <PulsingBlock className="mt-4 h-80 rounded-md" />
            </div>

            <div className="border-t border-border/45 px-4 py-4 xl:border-t-0 xl:border-l">
              <PulsingBlock className="h-4 w-28 rounded" />
              <PulsingBlock className="mt-2 h-3 w-56 rounded" />
              <PulsingBlock className="mt-4 h-24 rounded-md" />
              <div className="mt-3 space-y-2 rounded-md border border-border/35 bg-muted/15 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex justify-between gap-4">
                    <PulsingBlock className="h-3 w-20 rounded" />
                    <PulsingBlock className="h-3 w-24 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-border/45">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b border-border/35 px-3 py-2">
                <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <PulsingBlock key={j} className="h-3 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border-0 bg-card py-0 shadow-none ring-0">
          <div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <PulsingBlock className="h-4 w-28 rounded" />
              <PulsingBlock className="h-3 w-80 max-w-full rounded" />
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <PulsingBlock key={i} className="h-7 w-16 rounded-md" />
              ))}
            </div>
          </div>
          <div className="grid border-t border-border/45 bg-muted/10 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                className="border-b border-border/35 px-3 py-2.5 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0"
                key={i}
              >
                <PulsingBlock className="h-3 w-24 rounded" />
                <PulsingBlock className="mt-2 h-4 w-28 rounded" />
              </div>
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-b border-border/35 px-3 py-2">
              <div className="grid grid-cols-3 gap-3 md:grid-cols-7">
                {Array.from({ length: 7 }).map((__, j) => (
                  <PulsingBlock key={j} className="h-3 rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border-0 bg-card py-0 shadow-none ring-0">
          <div className="px-4 pt-4 pb-3">
            <PulsingBlock className="h-4 w-24 rounded" />
            <PulsingBlock className="mt-2 h-3 w-72 max-w-full rounded" />
          </div>
          <div className="grid border-t border-border/45 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="border-b border-border/45 px-4 py-3 lg:border-r lg:border-b-0">
              <div className="space-y-2 rounded-md border border-border/35 bg-muted/15 px-3 py-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex justify-between gap-4">
                    <PulsingBlock className="h-3 w-28 rounded" />
                    <PulsingBlock className="h-3 w-24 rounded" />
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="border-b border-border/30 py-2">
                  <PulsingBlock className="h-3 w-full rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export function ArenaSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <PulsingBlock className="h-4 w-32 rounded" />
            <PulsingBlock className="h-8 w-28 rounded-md" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                className="flex flex-col gap-3 rounded-lg bg-card p-4"
                key={i}
              >
                <div className="flex items-center gap-1.5">
                  <PulsingBlock className="size-5 rounded-full" />
                  <PulsingBlock className="h-3 w-20 rounded" />
                  <PulsingBlock className="h-3 w-10 rounded" />
                </div>
                <div className="space-y-2">
                  <PulsingBlock className="h-4 w-3/4 rounded" />
                  <PulsingBlock className="h-3 w-1/2 rounded" />
                </div>
                <PulsingBlock className="h-1.5 w-full rounded-full" />
                <div className="grid grid-cols-2 gap-2">
                  <PulsingBlock className="h-8 rounded-md" />
                  <PulsingBlock className="h-8 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          {Array.from({ length: 2 }).map((_, panel) => (
            <div className="rounded-lg bg-card" key={panel}>
              <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
                <PulsingBlock className="h-3.5 w-24 rounded" />
                <PulsingBlock className="size-4 rounded" />
              </div>
              <div className="px-2 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div className="flex items-center gap-3 px-2 py-2" key={i}>
                    <PulsingBlock className="size-5 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <PulsingBlock className="h-3 w-20 rounded" />
                      <PulsingBlock className="h-2.5 w-28 max-w-full rounded" />
                    </div>
                    <PulsingBlock className="h-3 w-8 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

export function LeaderboardSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="rounded-md bg-card px-4 py-3 shadow-none ring-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <PulsingBlock className="h-4 w-36 rounded" />
                <PulsingBlock className="h-4 w-20 rounded" />
                <PulsingBlock className="h-4 w-20 rounded" />
              </div>
              <PulsingBlock className="h-3.5 w-96 max-w-full rounded" />
              <PulsingBlock className="h-2.5 w-72 max-w-full rounded" />
            </div>
            <PulsingBlock className="h-9 w-full rounded-md sm:w-40" />
          </div>
        </div>

        <div className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
          <div className="grid bg-muted/10 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                className="border-b border-border/35 px-3 py-2.5 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0"
                key={i}
              >
                <PulsingBlock className="h-3 w-24 rounded" />
                <PulsingBlock className="mt-2 h-4 w-28 rounded" />
                <PulsingBlock className="mt-1 h-2.5 w-24 rounded" />
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
          <div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <PulsingBlock className="h-4 w-32 rounded" />
              <PulsingBlock className="h-3 w-96 max-w-full rounded" />
            </div>
            <PulsingBlock className="h-3 w-28 rounded" />
          </div>
          <div className="overflow-auto border-t border-border/45">
            <div className="min-w-[58rem]">
              <div className="grid grid-cols-[4rem_minmax(11rem,1fr)_8rem_5.5rem_8rem_7rem] gap-4 border-b border-border/45 bg-muted/45 px-3 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <PulsingBlock className="h-2.5 rounded" key={i} />
                ))}
              </div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  className="grid grid-cols-[4rem_minmax(11rem,1fr)_8rem_5.5rem_8rem_7rem] gap-4 border-b border-border/35 px-3 py-2"
                  key={i}
                >
                  {Array.from({ length: 6 }).map((__, j) => (
                    <PulsingBlock key={j} className="h-3 rounded" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
          <div className="px-4 py-3">
            <PulsingBlock className="h-4 w-32 rounded" />
            <PulsingBlock className="mt-2 h-3 w-80 max-w-full rounded" />
            <PulsingBlock className="mt-1.5 h-3 w-full max-w-4xl rounded" />
          </div>
        </div>
      </section>
    </main>
  )
}

const keeperTableColumns = "grid-cols-[minmax(9rem,1fr)_7rem_7rem_8rem_8rem_7rem]"

export function KeeperSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        {/* Header */}
        <div className="rounded-md bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <PulsingBlock className="h-4 w-48 rounded" />
            <PulsingBlock className="h-5 w-14 rounded-md" />
            <PulsingBlock className="h-5 w-16 rounded-md" />
          </div>
          <PulsingBlock className="mt-2 h-3 w-96 max-w-full rounded" />
        </div>

        {/* Heartbeat strip */}
        <div className="overflow-hidden rounded-md bg-card">
          <div className="grid bg-muted/10 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                className="border-b border-border/35 px-4 py-3 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0"
                key={i}
              >
                <PulsingBlock className="h-2.5 w-16 rounded" />
                <PulsingBlock className="mt-2 h-5 w-24 rounded" />
                <PulsingBlock className="mt-1.5 h-2.5 w-20 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Two tables */}
        {Array.from({ length: 2 }).map((_, table) => (
          <div
            className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0"
            key={table}
          >
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
              <PulsingBlock className="h-3.5 w-32 rounded" />
              <PulsingBlock className="h-2.5 w-16 rounded" />
            </div>
            <div className="border-t border-border/45">
              <div className={cn("grid gap-4 bg-muted/45 px-3 py-2", keeperTableColumns)}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <PulsingBlock className="h-2.5 rounded" key={i} />
                ))}
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  className={cn(
                    "grid gap-4 border-b border-border/35 px-3 py-2.5 last:border-b-0",
                    keeperTableColumns
                  )}
                  key={i}
                >
                  {Array.from({ length: 6 }).map((__, j) => (
                    <PulsingBlock className="h-3 rounded" key={j} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Two panels */}
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div className="space-y-3 rounded-md border border-border bg-card/86 p-5" key={i}>
              <div className="flex items-center justify-between gap-3">
                <PulsingBlock className="h-3.5 w-28 rounded" />
                <PulsingBlock className="h-5 w-20 rounded-md" />
              </div>
              <PulsingBlock className="h-3 w-full max-w-sm rounded" />
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((__, j) => (
                  <div className="flex items-center justify-between gap-4" key={j}>
                    <PulsingBlock className="h-2.5 w-20 rounded" />
                    <PulsingBlock className="h-2.5 w-24 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
