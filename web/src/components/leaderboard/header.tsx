import { Badge, BadgeTone } from "@/components/primitives/badge"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/format"
import {
  exportLeaderboardReport,
  getPeriodLabel,
  leaderboardPeriodOptions,
} from "@/lib/leaderboard/helpers"
import type { LeaderboardModel, LeaderboardPeriod } from "@/lib/leaderboard/types"
import { cn } from "@/lib/utils"

function PeriodSelector({
  onChange,
  value,
}: {
  onChange: (period: LeaderboardPeriod) => void
  value: LeaderboardPeriod
}) {
  return (
    <div className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:justify-end">
      {leaderboardPeriodOptions.map((option) => (
        <Button
          className={cn(
            "h-7 px-2.5 text-[11px] shadow-none",
            value === option.id && "bg-primary/10 text-primary"
          )}
          key={option.id}
          onClick={() => onChange(option.id)}
          size="xs"
          type="button"
          variant="ghost"
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

export function LeaderboardHeader({
  model,
  onPeriodChange,
  period,
}: {
  model: LeaderboardModel
  onPeriodChange: (period: LeaderboardPeriod) => void
  period: LeaderboardPeriod
}) {
  return (
    <div className="rounded-md bg-card px-4 py-3 shadow-none ring-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
              Predict Leaderboard
            </h1>
            <Badge className="px-2 py-0.5 text-[10px]" tone={BadgeTone.Warning}>
              Estimated
            </Badge>
            <Badge className="px-2 py-0.5 text-[10px]" tone={BadgeTone.Neutral}>
              Public data
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
            Account rank tape for realized PnL, volume, win rate, and public
            Predict activity.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase tabular-nums">
            <span>Built {formatRelativeTime(model.generatedAtMs)}</span>
            <span>{model.rows.length.toLocaleString("en-US")} accounts</span>
            <span>{getPeriodLabel(period)}</span>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <PeriodSelector onChange={onPeriodChange} value={period} />
          <Button
            className="w-full sm:w-auto"
            onClick={() => exportLeaderboardReport(model, period)}
            size="sm"
            type="button"
            variant="outline"
          >
            Export Leaderboard
          </Button>
        </div>
      </div>
    </div>
  )
}
