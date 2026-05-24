import { type SimpleMarket } from "~/lib/callit/simple/types"

import { MarketCard } from "./card"

export interface GridProps {
  markets: SimpleMarket[]
}

export function Grid({ markets }: GridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {markets.map((market) => (
        <MarketCard key={market.id} market={market} />
      ))}
    </div>
  )
}
