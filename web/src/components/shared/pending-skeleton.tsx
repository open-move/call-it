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

function TableSkeleton({
  columns,
  count,
  rowCount = 8,
}: {
  columns: string
  count: number
  rowCount?: number
}) {
  return (
    <div className="overflow-hidden rounded-md bg-transparent py-0 shadow-none ring-0 lg:bg-card">
      {Array.from({ length: rowCount }).map((_, i) => (
        <div key={i} className="border-b border-border/35 last:border-b-0">
          <PulsingRow
            columns={`hidden lg:grid ${columns} items-center min-h-14`}
            count={count}
          />
        </div>
      ))}
    </div>
  )
}

export function MarketsSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="flex flex-col gap-8">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.64fr)]">
            <div className="rounded-md border-0 bg-card p-3 shadow-none ring-0">
              <div className="mb-2 flex items-center gap-1.5">
                <PulsingBlock className="size-3.5 rounded" />
                <PulsingBlock className="h-3.5 w-24 rounded" />
              </div>
              <div className="space-y-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-1.5"
                  >
                    <PulsingBlock className="size-6 rounded-full" />
                    <div className="min-w-0 space-y-1">
                      <PulsingBlock className="h-3 w-3/5 rounded" />
                      <PulsingBlock className="h-2.5 w-2/5 rounded" />
                    </div>
                    <div className="space-y-1 text-right">
                      <PulsingBlock className="float-right h-3 w-12 rounded" />
                      <PulsingBlock className="float-right h-2.5 w-8 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-md border-0 bg-card p-3 shadow-none ring-0">
              <div className="flex h-full min-h-36 flex-col justify-between gap-3">
                <div className="mb-2 flex items-center gap-1.5">
                  <PulsingBlock className="size-3.5 rounded" />
                  <PulsingBlock className="h-3.5 w-36 rounded" />
                </div>
                <PulsingBlock className="h-10 rounded" />
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5"
                    >
                      <PulsingBlock className="h-2.5 w-8 rounded" />
                      <PulsingBlock className="mt-0.5 h-3 w-12 rounded" />
                    </div>
                  ))}
                </div>
                <PulsingBlock className="h-3.5 w-36 rounded" />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <PulsingBlock className="h-9 w-40 rounded-md" />
              <div className="flex items-center gap-2">
                <PulsingBlock className="h-9 w-72 rounded-md" />
                <PulsingBlock className="size-9 rounded-md" />
              </div>
            </div>

            <TableSkeleton
              columns="lg:grid-cols-[minmax(15rem,1.5fr)_7rem_0.6fr_0.7fr_0.75fr_0.75fr_7rem]"
              count={7}
              rowCount={8}
            />
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
          <div className="h-120 min-w-0">
            <div className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
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

          <div className="h-[30rem] min-w-0">
            <div className="flex h-full w-full flex-col gap-4 rounded-md border-0 bg-card py-0 shadow-none ring-0">
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
            <div className="flex h-full flex-col rounded-md border-0 bg-card py-0 shadow-none ring-0">
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

        <aside className="h-full min-w-0">
          <div className="flex h-full w-full flex-col gap-2">
            <div className="w-full overflow-hidden rounded-md bg-muted p-0">
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
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <PulsingBlock className="h-4 w-16 rounded" />
            <div className="flex min-w-0 items-center gap-2">
              <PulsingBlock className="h-9 flex-1 rounded-md sm:w-72 sm:flex-none" />
              <PulsingBlock className="size-9 rounded-md" />
            </div>
          </div>

          <div className="overflow-hidden rounded-md bg-card py-0 shadow-none ring-0">
            <div className="hidden items-center border-b border-border/25 px-3 py-2 lg:grid lg:grid-cols-[minmax(16rem,1.6fr)_1fr_0.75fr_0.85fr_7rem]">
              {Array.from({ length: 5 }).map((_, i) => (
                <PulsingBlock key={i} className="h-2.5 rounded" />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="border-b border-border/35 last:border-b-0"
              >
                <div className="hidden min-h-14 items-center px-3 py-2 lg:grid lg:grid-cols-[minmax(16rem,1.6fr)_1fr_0.75fr_0.85fr_7rem]">
                  <div className="flex items-center gap-2.5">
                    <PulsingBlock className="size-6 shrink-0 rounded-full" />
                    <div className="space-y-1">
                      <PulsingBlock className="h-3 w-28 rounded" />
                      <PulsingBlock className="h-2.5 w-20 rounded" />
                    </div>
                  </div>
                  {Array.from({ length: 3 }).map((__, j) => (
                    <PulsingBlock
                      key={j}
                      className="h-3 rounded border-l border-border/25 pl-3 text-right"
                    />
                  ))}
                  <PulsingBlock className="ml-auto h-8 w-20 rounded-md" />
                </div>
              </div>
            ))}
          </div>
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
            <div className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
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
            <div className="flex h-full flex-col rounded-md border-0 bg-card py-0 shadow-none ring-0">
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
          <div className="gap-2 rounded-md border-0 bg-card pt-3 shadow-none ring-0">
            <div className="grid gap-4 px-3 py-3">
              <div className="space-y-2">
                <PulsingBlock className="h-8 w-48 rounded" />
                <PulsingBlock className="h-3 w-32 rounded" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="min-w-0 rounded-md bg-muted/35 px-2.5 py-2"
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
            <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-3">
              <PulsingBlock className="h-8 w-40 rounded-md" />
              <div className="hidden gap-1 sm:flex">
                {Array.from({ length: 4 }).map((_, i) => (
                  <PulsingBlock key={i} className="h-7 w-10 rounded-md" />
                ))}
              </div>
            </div>
            <div className="grid min-h-52 place-items-center px-3 py-3">
              <PulsingBlock className="h-40 w-full max-w-2xl rounded-md" />
            </div>
          </div>
        </div>

        <div className="min-h-96 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
          <div className="flex flex-col gap-3 border-b border-border/40 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <PulsingBlock key={i} className="h-8 w-20 rounded-md" />
              ))}
            </div>
            <PulsingBlock className="h-9 w-full rounded-md lg:w-72" />
          </div>
          <div className="hidden lg:block">
            <div className="min-w-[62rem]">
              <div className="grid grid-cols-[minmax(14rem,1.8fr)_4rem_7rem_5rem_5rem_7rem_7rem_7rem_5rem] gap-4 bg-muted/35 px-3 py-2">
                {Array.from({ length: 9 }).map((_, i) => (
                  <PulsingBlock key={i} className="h-2.5 rounded" />
                ))}
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="border-b border-border/30 px-3 py-2.5">
                  <div className="grid grid-cols-[minmax(14rem,1.8fr)_4rem_7rem_5rem_5rem_7rem_7rem_7rem_5rem] gap-4">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <PulsingBlock key={j} className="h-3 rounded" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
        <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="h-full gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
            <div className="border-b border-border/40 px-3 py-2.5">
              <PulsingBlock className="h-4 w-28 rounded" />
            </div>
            <div className="px-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="min-w-0">
                    <PulsingBlock className="h-2.5 w-14 rounded" />
                    <PulsingBlock className="mt-0.5 h-3 w-16 rounded" />
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <PulsingBlock className="h-60 rounded-md sm:h-64" />
              </div>
            </div>
          </div>

          <div className="h-full rounded-md border-0 bg-card py-0 shadow-none ring-0 xl:row-span-2">
            <div className="flex h-full flex-col gap-4 px-4 py-4">
              <PulsingBlock className="h-4 w-24 rounded" />
              <PulsingBlock className="h-8 w-36 rounded" />
              <div className="space-y-2 border-t border-border/40 pt-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4"
                  >
                    <PulsingBlock className="h-3 w-16 rounded" />
                    <PulsingBlock className="h-3 w-20 rounded" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PulsingBlock className="h-9 rounded-md" />
                <PulsingBlock className="h-9 rounded-md" />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
          <div className="border-b border-border/40 px-3 py-2.5">
            <PulsingBlock className="h-4 w-28 rounded" />
          </div>
          <div className="grid gap-4 px-3 py-3 md:grid-cols-2">
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4"
                >
                  <PulsingBlock className="h-3 w-24 rounded" />
                  <PulsingBlock className="h-3 w-16 rounded" />
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-border/40 pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4"
                >
                  <PulsingBlock className="h-3 w-24 rounded" />
                  <PulsingBlock className="h-3 w-16 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
          <div className="border-b border-border/40 px-3 py-2.5">
            <PulsingBlock className="h-4 w-20 rounded" />
          </div>
          <div className="px-0 py-0">
            <div className="hidden items-center bg-muted/35 px-3 py-2 md:grid md:grid-cols-[0.7fr_1fr_1fr_1fr_0.7fr]">
              {Array.from({ length: 5 }).map((_, i) => (
                <PulsingBlock key={i} className="h-2.5 rounded" />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="grid gap-1.5 border-b border-border/25 px-3 py-2.5 last:border-b-0 md:grid-cols-[0.7fr_1fr_1fr_1fr_0.7fr] md:items-center"
              >
                {Array.from({ length: 5 }).map((__, j) => (
                  <PulsingBlock key={j} className="h-3 rounded" />
                ))}
              </div>
            ))}
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
        <div className="rounded-md bg-card px-4 py-3 shadow-none ring-0">
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
            <PulsingBlock className="h-9 w-full rounded-md sm:w-40" />
          </div>
        </div>

        <div className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
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

        <div className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
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

        <div className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
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

export function LeaderboardSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="rounded-md bg-card px-3 py-3 shadow-none ring-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <PulsingBlock className="h-5 w-44 rounded" />
              <PulsingBlock className="h-3.5 w-96 max-w-full rounded" />
              <PulsingBlock className="h-2.5 w-48 rounded" />
            </div>
            <PulsingBlock className="h-9 w-full rounded-md sm:w-40" />
          </div>
        </div>

        <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
            <div className="border-b border-border/40 px-3 py-2.5">
              <PulsingBlock className="h-4 w-28 rounded" />
            </div>
            <div className="px-3 py-3">
              <PulsingBlock className="h-64 rounded-md" />
            </div>
          </div>

          <div className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
            <div className="border-b border-border/40 px-3 py-2.5">
              <PulsingBlock className="h-4 w-36 rounded" />
            </div>
            <div className="space-y-4 px-3 py-3">
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-md bg-muted/35 px-2.5 py-2">
                    <PulsingBlock className="h-2.5 w-16 rounded" />
                    <PulsingBlock className="mt-1 h-3.5 w-20 rounded" />
                  </div>
                ))}
              </div>
              <PulsingBlock className="h-20 rounded-md" />
            </div>
          </div>
        </div>

        <div className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
          <div className="border-b border-border/40 px-3 py-2.5">
            <PulsingBlock className="h-4 w-36 rounded" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="border-b border-border/25 px-3 py-2.5 last:border-b-0"
            >
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-9">
                {Array.from({ length: 9 }).map((__, j) => (
                  <PulsingBlock key={j} className="h-3 rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
