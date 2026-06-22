import { ArrowUpRightIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { formatRelativeTime } from "@/lib/format"
import {
  formatAddress,
  formatDusdc,
  formatOptionalPercent,
  formatSignedDusdc,
  getAccountUrl,
  getPnlClassName,
} from "@/lib/leaderboard/helpers"
import type { LeaderboardAccountRow } from "@/lib/leaderboard/types"
import { cn } from "@/lib/utils"

function TableValue({
  className,
  muted = false,
  value,
}: {
  className?: string
  muted?: boolean
  value: string
}) {
  return (
    <span
      className={cn(
        "truncate text-right font-mono tabular-nums",
        muted ? "text-muted-foreground" : "text-foreground",
        className
      )}
    >
      {value}
    </span>
  )
}

function LeaderboardRow({ row }: { row: LeaderboardAccountRow }) {
  return (
    <div className="grid grid-cols-[4rem_minmax(11rem,1fr)_8rem_5.5rem_8rem_7rem] gap-4 border-b border-border/35 px-3 py-2 text-xs last:border-b-0">
      <span className="font-mono text-sm font-medium text-primary tabular-nums">
        #{row.rank}
      </span>
      <div className="min-w-0">
        <a
          className="group inline-flex max-w-full items-center gap-1.5 font-mono font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          href={getAccountUrl(row.account)}
          rel="noreferrer"
          target="_blank"
        >
          <span className="truncate">{formatAddress(row.account)}</span>
          <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </a>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase">
          {row.directionalCount} dir / {row.rangeCount} range /{" "}
          {row.settledCount} settled
        </div>
      </div>
      <TableValue
        className={getPnlClassName(row.realizedPnlUsd)}
        value={formatSignedDusdc(row.realizedPnlUsd)}
      />
      <TableValue
        className={
          row.realizedPnlPct === null
            ? "text-muted-foreground"
            : getPnlClassName(row.realizedPnlPct)
        }
        value={formatOptionalPercent(row.realizedPnlPct)}
      />
      <TableValue value={formatDusdc(row.volumeUsd)} />
      <TableValue
        muted
        value={
          row.lastActivityAtMs > 0
            ? formatRelativeTime(row.lastActivityAtMs)
            : "--"
        }
      />
    </div>
  )
}

function LeaderboardTable({ rows }: { rows: LeaderboardAccountRow[] }) {
  return (
    <div className="overflow-auto border-t border-border/45">
      <div className="min-w-[58rem]">
        <div className="grid grid-cols-[4rem_minmax(11rem,1fr)_8rem_5.5rem_8rem_7rem] gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          <span>Rank</span>
          <span>Account</span>
          <span className="text-right">Realized PnL</span>
          <span className="text-right">ROI</span>
          <span className="text-right">Volume</span>
          <span className="text-right">Last</span>
        </div>
        {rows.length > 0 ? (
          rows
            .slice(0, 50)
            .map((row) => <LeaderboardRow key={row.account} row={row} />)
        ) : (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            No leaderboard data yet.
          </div>
        )}
      </div>
    </div>
  )
}

export function AccountRankings({ rows }: { rows: LeaderboardAccountRow[] }) {
  return (
    <Card className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
              Account Rankings
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Top 50 accounts ranked by realized PnL, then volume and activity.
            </p>
          </div>
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase tabular-nums">
            {rows.length.toLocaleString("en-US")} reconstructed
          </div>
        </div>
        <LeaderboardTable rows={rows} />
      </CardContent>
    </Card>
  )
}
