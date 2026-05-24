import { type MarketSnapshot } from "~/lib/callit/market/types"

export interface PageProps {
  market: MarketSnapshot
}

export function Page({ market }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="rounded-md border border-border/70 bg-surface-raised px-4 py-8 text-sm text-muted-foreground">
        Pro detail is not available yet for {market.assetSymbol}.
      </div>
    </main>
  )
}
