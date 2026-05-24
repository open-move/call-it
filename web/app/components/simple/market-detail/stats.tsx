import {
  StatStrip,
  StatTone,
} from "~/components/shared/data-display/stat-strip"
import { formatUsd } from "~/lib/callit/format"
import { type SimpleMarket } from "~/lib/callit/simple/types"

export interface StatsProps {
  market: SimpleMarket
}

export function Stats({ market }: StatsProps) {
  return (
    <StatStrip
      items={[
        {
          label: "Current",
          value: formatUsd(market.currentPriceUsd, 0),
        },
        {
          label: "Target",
          tone: StatTone.Positive,
          value: `Above ${formatUsd(market.strikePriceUsd, 0)}`,
        },
        {
          label: "Ends",
          value: market.durationLabel,
        },
      ]}
    />
  )
}
