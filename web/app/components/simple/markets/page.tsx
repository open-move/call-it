import { type SimpleMarket } from "~/lib/callit/simple/types"

import { Grid } from "./grid"

export interface PageProps {
  markets: SimpleMarket[]
}

export function Page({ markets }: PageProps) {
  return (
    <section className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8">
      {markets.length > 0 ? (
        <Grid markets={markets} />
      ) : (
        <div className="rounded-md border border-border/70 bg-surface-raised px-4 py-8 text-center text-sm text-muted-foreground">
          No live markets are available right now.
        </div>
      )}
    </section>
  )
}
