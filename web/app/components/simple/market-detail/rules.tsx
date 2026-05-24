import { formatUsd } from "~/lib/callit/format"
import { type SimpleMarket } from "~/lib/callit/simple/types"

export interface RulesProps {
  market: SimpleMarket
}

export function Rules({ market }: RulesProps) {
  return (
    <section className="space-y-2 py-2">
      <h2 className="text-sm font-semibold text-foreground">Rules</h2>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        Yes wins if {market.assetSymbol} settles above{" "}
        {formatUsd(market.strikePriceUsd, 0)}. No wins if it settles at or below{" "}
        {formatUsd(market.strikePriceUsd, 0)}. Loss is capped to your risk
        amount. No borrowing. No liquidation.
      </p>
    </section>
  )
}
