import { ArrowUpRightIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Pager } from "@/components/primitives/pager"
import { Card, CardContent } from "@/components/ui/card"
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

const PAGE_SIZE = 15

const COLUMNS =
  "grid grid-cols-[2.5rem_minmax(0,1fr)_6.5rem] gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_7rem_5rem] sm:gap-4 lg:grid-cols-[3rem_minmax(0,1fr)_8rem_5.5rem_8rem]"

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
    <div
      className={cn(
        COLUMNS,
        "items-center border-b border-border/35 px-3 py-2 text-xs transition-colors last:border-b-0 hover:bg-muted/20"
      )}
    >
      <span
        className={cn(
          "font-mono text-sm font-medium tabular-nums",
          row.rank <= 3 ? "text-primary" : "text-muted-foreground"
        )}
      >
        #{row.rank}
      </span>
      <a
        className="group inline-flex max-w-full min-w-0 items-center gap-1.5 font-mono font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
        href={getAccountUrl(row.account)}
        rel="noreferrer"
        target="_blank"
      >
        <span className="truncate">{formatAddress(row.account)}</span>
        <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      </a>
      <TableValue
        className={getPnlClassName(row.realizedPnlUsd)}
        value={formatSignedDusdc(row.realizedPnlUsd)}
      />
      <TableValue
        className={cn(
          "hidden sm:block",
          row.realizedPnlPct === null
            ? "text-muted-foreground"
            : getPnlClassName(row.realizedPnlPct)
        )}
        value={formatOptionalPercent(row.realizedPnlPct)}
      />
      <TableValue
        className="hidden lg:block"
        value={formatDusdc(row.volumeUsd)}
      />
    </div>
  )
}

function LeaderboardTable({ rows }: { rows: LeaderboardAccountRow[] }) {
  return (
    <div className="border-t border-border/45">
      <div
        className={cn(
          COLUMNS,
          "border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
        )}
      >
        <span>Rank</span>
        <span>Account</span>
        <span className="text-right">Realized PnL</span>
        <span className="hidden text-right sm:block">ROI</span>
        <span className="hidden text-right lg:block">Volume</span>
      </div>
      {rows.length > 0 ? (
        rows.map((row) => <LeaderboardRow key={row.account} row={row} />)
      ) : (
        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
          No leaderboard data yet.
        </div>
      )}
    </div>
  )
}

export function AccountRankings({ rows }: { rows: LeaderboardAccountRow[] }) {
  const [page, setPage] = useState(0)

  // Period switches swap the row set; jump back to the first page.
  useEffect(() => {
    setPage(0)
  }, [rows])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const visibleRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <Card className="overflow-hidden rounded-lg border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-3">
          <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            Account rankings
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
            Accounts ranked by realized PnL, then volume and activity.
          </p>
        </div>
        <LeaderboardTable rows={visibleRows} />
        <Pager
          onPage={setPage}
          page={page}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
          total={rows.length}
        />
      </CardContent>
    </Card>
  )
}
