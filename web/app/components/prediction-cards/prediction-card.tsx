import { BookmarkIcon, InfoIcon } from "lucide-react"
import { Link } from "react-router"

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { formatCompactUsd } from "~/lib/callit/format"
import { type PredictionMarketCardData } from "~/lib/callit/types"

import { OutcomeRail } from "./outcome-rail"

export interface PredictionCardProps {
  market: PredictionMarketCardData
}

export function PredictionCard({ market }: PredictionCardProps) {
  const volumeLabel = `Vol ${formatCompactUsd(market.volumeUsd)}`

  return (
    <Link
      aria-label={`Open ${market.assetName} market`}
      className="group block rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      to={`/markets/${market.id}`}
    >
      <Card
        className="relative min-h-40 cursor-pointer justify-between rounded-md bg-surface-raised py-4 ring-0 shadow-none transition-colors hover:bg-surface-hover"
        size="sm"
      >
        <CardHeader className="px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <img
                alt={`${market.assetName} icon`}
                className="size-7 shrink-0 rounded-full"
                src={market.assetIconUrl}
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
          <span>
            {volumeLabel} · {market.durationLabel}
          </span>
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
