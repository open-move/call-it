import { type MarketSnapshot } from "~/lib/callit/market/types"

export interface PageProps {
  markets: MarketSnapshot[]
}

export function Page({ markets }: PageProps) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-md border border-border/70 bg-surface-raised px-4 py-8 text-sm text-muted-foreground">
        Pro markets are not available yet. {markets.length} live markets are
        loaded for this surface.
      </div>
    </section>
  )
}
