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
import { cn } from "~/lib/utils"

export interface MarketCardProps {
  market: SimpleMarket
}

function clampPercent(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 100)
}

function getProbabilityPercent(probability: number | undefined) {
  return probability === undefined ? undefined : clampPercent(probability * 100)
}

function formatOutcomeLabel(label: string, percent: number | undefined) {
  return percent === undefined ? label : `${label} ${percent}%`
}

export function MarketCard({ market }: MarketCardProps) {
  const footerParts = [
    formatUsd(market.currentPriceUsd, market.currentPriceUsd >= 100 ? 0 : 2),
    market.volumeUsd === undefined
      ? undefined
      : `Vol ${formatCompactUsd(market.volumeUsd)}`,
    market.durationLabel,
  ].filter((part): part is string => part !== undefined)
  const [yesOutcome, noOutcome] = market.outcomes
  const yesPercent = getProbabilityPercent(market.fairUpProbability)
  const noPercent = yesPercent === undefined ? undefined : 100 - yesPercent

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
          <div className="flex items-start justify-between gap-3">
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
            <OutcomeGauge label="Chance" percent={yesPercent} />
          </div>
        </CardHeader>

        <CardContent className="px-4 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <OutcomeButton
              label={formatOutcomeLabel(yesOutcome.label, yesPercent)}
              tone="up"
            />
            <OutcomeButton
              label={formatOutcomeLabel(noOutcome.label, noPercent)}
              tone="down"
            />
          </div>
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

function OutcomeButton({
  label,
  tone,
}: {
  label: string
  tone: "up" | "down"
}) {
  return (
    <span
      className={cn(
        "flex h-10 items-center justify-center rounded-md text-sm font-semibold transition-colors",
        tone === "up"
          ? "bg-outcome-up-surface/55 text-outcome-up-foreground group-hover:bg-outcome-up-surface/75"
          : "bg-outcome-down-surface/50 text-outcome-down-foreground group-hover:bg-outcome-down-surface/70"
      )}
    >
      {label}
    </span>
  )
}

function OutcomeGauge({ label, percent }: { label: string; percent?: number }) {
  const displayPercent =
    percent === undefined ? undefined : clampPercent(percent)

  return (
    <div
      aria-label={
        displayPercent === undefined
          ? `${label} is not available yet`
          : `${label} ${displayPercent} percent`
      }
      className="shrink-0 text-center"
    >
      <div className="relative h-8 w-11">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 44 32"
        >
          <path
            d="M8 24 A14 14 0 0 1 36 24"
            fill="none"
            pathLength={100}
            stroke="var(--surface-muted)"
            strokeLinecap="round"
            strokeWidth="4"
          />
          {displayPercent !== undefined ? (
            <path
              d="M8 24 A14 14 0 0 1 36 24"
              fill="none"
              pathLength={100}
              stroke="var(--outcome-up)"
              strokeDasharray={`${displayPercent} 100`}
              strokeLinecap="round"
              strokeWidth="4"
            />
          ) : null}
        </svg>
        <div className="absolute inset-x-0 top-3 font-mono text-[10px] font-semibold text-foreground tabular-nums">
          {displayPercent === undefined ? "--" : `${displayPercent}%`}
        </div>
      </div>
      <div className="-mt-1 font-mono text-[9px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  )
}
