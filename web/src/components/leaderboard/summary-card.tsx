import {
  formatDusdc,
  formatSignedDusdc,
  getPnlClassName,
} from "@/lib/leaderboard/helpers"
import type { LeaderboardModel } from "@/lib/leaderboard/types"
import { cn } from "@/lib/utils"

function SummaryCell({
  className,
  index,
  label,
  value,
}: {
  className?: string
  index: number
  label: string
  value: string
}) {
  return (
    <div className={cn("min-w-0", index > 0 && "sm:pl-5")}>
      <div className="text-xs leading-none text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-2 truncate font-mono text-xl leading-tight font-semibold tracking-[-0.03em] tabular-nums text-foreground",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}

export function LeaderboardSummary({ model }: { model: LeaderboardModel }) {
  return (
    <div className="rounded-lg bg-card p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 sm:gap-x-0 sm:divide-x sm:divide-border/40">
        <SummaryCell
          index={0}
          label="Accounts"
          value={model.totals.accounts.toLocaleString("en-US")}
        />
        <SummaryCell
          index={1}
          label="Activity"
          value={model.totals.activityCount.toLocaleString("en-US")}
        />
        <SummaryCell
          index={2}
          label="Volume"
          value={formatDusdc(model.totals.volumeUsd, 0)}
        />
        <SummaryCell
          className={getPnlClassName(model.totals.realizedPnlUsd)}
          index={3}
          label="Realized PnL"
          value={formatSignedDusdc(model.totals.realizedPnlUsd, 0)}
        />
      </div>
    </div>
  )
}
