import { Segmented } from "@/components/primitives/segmented"
import { Button } from "@/components/ui/button"
import {
  exportLeaderboardReport,
  leaderboardPeriodOptions,
} from "@/lib/leaderboard/helpers"
import type {
  LeaderboardModel,
  LeaderboardPeriod,
} from "@/lib/leaderboard/types"

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
    <div className="px-1 pt-1 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-balance text-foreground">
            Predict Leaderboard
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            Who's sharpest on Predict, ranked by realized PnL, volume, and win
            rate from public on-chain activity.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <Segmented
            onChange={onPeriodChange}
            options={leaderboardPeriodOptions}
            value={period}
          />
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
