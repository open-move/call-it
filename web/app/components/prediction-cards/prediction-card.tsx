import { BookmarkIcon, InfoIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
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
    <Card
      className="relative min-h-40 justify-between rounded-md bg-card/90 bg-[radial-gradient(circle_at_20%_0%,color-mix(in_oklch,var(--muted)_72%,transparent),transparent_34%),linear-gradient(180deg,var(--card),color-mix(in_oklch,var(--card)_86%,transparent))] py-4 ring-0 shadow-none transition-colors hover:bg-card"
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
        <div className="flex items-center gap-1">
          <Button
            aria-label={`View ${market.assetName} market details`}
            className="size-6 text-muted-foreground hover:text-foreground"
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <InfoIcon />
          </Button>
          <Button
            aria-label={`Save ${market.assetName} market`}
            className="size-6 text-muted-foreground hover:text-foreground"
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <BookmarkIcon />
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
