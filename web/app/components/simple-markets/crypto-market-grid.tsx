import { PredictionCard } from "~/components/prediction-cards/prediction-card"
import { type PredictionMarketCardData } from "~/lib/callit/types"

export interface CryptoMarketGridProps {
  markets: PredictionMarketCardData[]
}

export function CryptoMarketGrid({ markets }: CryptoMarketGridProps) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {markets.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {markets.map((market) => (
            <PredictionCard key={market.id} market={market} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-border/70 bg-surface-raised px-4 py-8 text-center text-sm text-muted-foreground">
          No live markets are available right now.
        </div>
      )}
    </section>
  )
}
