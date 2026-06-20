import { Card, CardContent } from "@/components/ui/card"
import {
  formatDusdc,
  formatSignedDusdc,
  getPnlClassName,
} from "@/lib/leaderboard/helpers"
import type { LeaderboardModel } from "@/lib/leaderboard/types"
import { cn } from "@/lib/utils"

function SummaryCell({
  className,
  emphasis = false,
  label,
  meta,
  value,
}: {
  className?: string
  emphasis?: boolean
  label: string
  meta: string
  value: string
}) {
  return (
    <div className="border-b border-border/35 px-3 py-2.5 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0">
      <div className="text-xs leading-none text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-2 truncate font-mono font-medium text-foreground tabular-nums",
          emphasis ? "text-xl leading-tight" : "text-sm",
          className
        )}
      >
        {value}
      </div>
      <div className="mt-1 truncate font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {meta}
      </div>
    </div>
  )
}

export function LeaderboardSummary({ model }: { model: LeaderboardModel }) {
  return (
    <Card className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <div className="grid bg-muted/10 md:grid-cols-4">
          <SummaryCell
            label="Accounts"
            meta="Reconstructed book"
            value={model.totals.accounts.toLocaleString("en-US")}
          />
          <SummaryCell
            label="Activity"
            meta="Public actions"
            value={model.totals.activityCount.toLocaleString("en-US")}
          />
          <SummaryCell
            label="Volume"
            meta="Mint cost basis"
            value={formatDusdc(model.totals.volumeUsd, 0)}
          />
          <SummaryCell
            className={getPnlClassName(model.totals.realizedPnlUsd)}
            emphasis
            label="Realized PnL"
            meta="Estimated settlement PnL"
            value={formatSignedDusdc(model.totals.realizedPnlUsd, 0)}
          />
        </div>
      </CardContent>
    </Card>
  )
}
