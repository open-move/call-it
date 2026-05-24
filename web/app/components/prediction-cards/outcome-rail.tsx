import { type PredictionOutcomeOption } from "~/lib/callit/types"

export interface OutcomeRailProps {
  outcomes: [PredictionOutcomeOption, PredictionOutcomeOption]
  primaryPercent: number
}

function clampPercent(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 100)
}

export function OutcomeRail({ outcomes, primaryPercent }: OutcomeRailProps) {
  const firstPercent = clampPercent(primaryPercent)
  const secondPercent = 100 - firstPercent
  const [firstOutcome, secondOutcome] = outcomes

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 text-[11px] font-medium">
        <span className="text-emerald-400">
          {firstOutcome.label} {firstPercent}%
        </span>
        <span className="text-red-400">
          {secondOutcome.label} {secondPercent}%
        </span>
      </div>
      <div
        aria-label={`${firstOutcome.label} ${firstPercent} percent, ${secondOutcome.label} ${secondPercent} percent`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={firstPercent}
        className="flex h-1.5 overflow-hidden rounded-md bg-muted shadow-inner ring-1 ring-white/10"
        role="meter"
      >
        <div
          className="h-full bg-emerald-400/80"
          style={{ width: `${firstPercent}%` }}
        />
        <div
          className="h-full bg-red-400/80"
          style={{ width: `${secondPercent}%` }}
        />
      </div>
    </div>
  )
}
