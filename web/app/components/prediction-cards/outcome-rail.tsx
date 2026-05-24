import { type PredictionOutcomeOption } from "~/lib/callit/types"
import { cn } from "~/lib/utils"

export interface OutcomeRailProps {
  barClassName?: string
  className?: string
  labelClassName?: string
  outcomes: [PredictionOutcomeOption, PredictionOutcomeOption]
  primaryPercent: number
}

function clampPercent(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 100)
}

export function OutcomeRail({
  barClassName,
  className,
  labelClassName,
  outcomes,
  primaryPercent,
}: OutcomeRailProps) {
  const firstPercent = clampPercent(primaryPercent)
  const secondPercent = 100 - firstPercent
  const [firstOutcome, secondOutcome] = outcomes

  return (
    <div className={cn("space-y-2.5", className)}>
      <div
        className={cn(
          "flex items-center justify-between gap-3 text-[11px] font-medium",
          labelClassName
        )}
      >
        <span className="text-outcome-up">
          {firstOutcome.label} {firstPercent}%
        </span>
        <span className="text-outcome-down">
          {secondOutcome.label} {secondPercent}%
        </span>
      </div>
      <div
        aria-label={`${firstOutcome.label} ${firstPercent} percent, ${secondOutcome.label} ${secondPercent} percent`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={firstPercent}
        className={cn(
          "flex h-1.5 overflow-hidden rounded-md bg-surface-muted shadow-inner ring-1 ring-border/40",
          barClassName
        )}
        role="meter"
      >
        <div
          className="h-full bg-outcome-up"
          style={{ width: `${firstPercent}%` }}
        />
        <div
          className="h-full bg-outcome-down"
          style={{ width: `${secondPercent}%` }}
        />
      </div>
    </div>
  )
}
