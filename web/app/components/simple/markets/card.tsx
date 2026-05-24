import { BookmarkIcon, InfoIcon } from "lucide-react"
import { Link } from "react-router"

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { AssetIcon } from "~/components/shared/market/asset-icon"
import { formatCompactUsd, formatUsd } from "~/lib/callit/format"
import { type SimpleMarket } from "~/lib/callit/simple/types"

import { OutcomeRail } from "./outcome-rail"

export interface MarketCardProps {
  market: SimpleMarket
}

export function MarketCard({ market }: MarketCardProps) {
  const footerParts = [
    formatUsd(market.currentPriceUsd, market.currentPriceUsd >= 100 ? 0 : 2),
    market.volumeUsd === undefined
      ? undefined
      : `Vol ${formatCompactUsd(market.volumeUsd)}`,
    market.durationLabel,
  ].filter((part): part is string => part !== undefined)

  return (
    <Link
      aria-label={`Open ${market.assetName} market`}
      className="group block rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      to={`/markets/${market.id}`}
    >
      <Card
        className="relative min-h-40 cursor-pointer justify-between rounded-md bg-surface-raised py-4 shadow-none ring-0 transition-colors hover:bg-surface-hover"
        size="sm"
      >
        <CardHeader className="px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <AssetIcon
                assetIconUrl={market.assetIconUrl}
                assetName={market.assetName}
                assetSymbol={market.assetSymbol}
                className="size-7"
              />
              <CardTitle className="min-w-0 text-sm leading-5 font-semibold tracking-tight text-foreground">
                {market.prompt}
              </CardTitle>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 pt-1">
          <OutcomeRail
            outcomes={market.outcomes}
            primaryPercent={market.primaryOutcomePercent}
          />
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-3 px-4 text-xs text-muted-foreground">
          <span>{footerParts.join(" · ")}</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:text-foreground">
              <InfoIcon className="size-3" />
            </span>
            <span className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:text-foreground">
              <BookmarkIcon className="size-3" />
            </span>
          </span>
        </CardFooter>
      </Card>
    </Link>
  )
}
