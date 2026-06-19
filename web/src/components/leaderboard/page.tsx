import { useState } from "react"
import { ArrowUpRightIcon } from "lucide-react"

import { Badge, BadgeTone } from "@/components/primitives/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SUI_NETWORK } from "@/lib/config"
import { formatPercent, formatRelativeTime } from "@/lib/format"
import { buildLeaderboardReport } from "@/lib/leaderboard/calculations"
import type {
  LeaderboardAccountRow,
  LeaderboardModel,
  LeaderboardPeriod,
  LeaderboardPeriodModels,
} from "@/lib/leaderboard/types"
import { cn } from "@/lib/utils"

export interface LeaderboardPageProps {
  models: LeaderboardPeriodModels
}

const leaderboardPeriodOptions = [
  { id: "today", label: "Today", meta: "24h" },
  { id: "weekly", label: "Weekly", meta: "7d" },
  { id: "monthly", label: "Monthly", meta: "30d" },
  { id: "allTime", label: "All time", meta: "Full" },
] satisfies { id: LeaderboardPeriod; label: string; meta: string }[]

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function getAccountUrl(account: string) {
  return `https://suiscan.xyz/${SUI_NETWORK}/account/${account}`
}

function formatDusdc(value: number, maximumFractionDigits = 2) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })} DUSDC`
}

function formatSignedDusdc(value: number, maximumFractionDigits = 2) {
  if (value > 0) {
    return `+${formatDusdc(value, maximumFractionDigits)}`
  }

  if (value < 0) {
    return `-${formatDusdc(Math.abs(value), maximumFractionDigits)}`
  }

  return formatDusdc(0, maximumFractionDigits)
}

function formatOptionalPercent(value: number | null) {
  return value === null ? "--" : formatPercent(value)
}

function getPnlClassName(value: number) {
  if (value === 0) {
    return "text-muted-foreground"
  }

  return value > 0 ? "text-outcome-up" : "text-outcome-down"
}

function getPeriodLabel(period: LeaderboardPeriod) {
  return (
    leaderboardPeriodOptions.find((option) => option.id === period)?.label ??
    "All time"
  )
}

function exportLeaderboardReport(
  model: LeaderboardModel,
  period: LeaderboardPeriod
) {
  const report = buildLeaderboardReport(model)
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const periodSlug = period.replace(
    /[A-Z]/g,
    (match) => `-${match.toLowerCase()}`
  )

  link.href = url
  link.download = `callit-predict-leaderboard-${periodSlug}-${report.generatedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function Page({ models }: LeaderboardPageProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("allTime")
  const model = models[period]

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <LeaderboardHeader
          model={model}
          onPeriodChange={setPeriod}
          period={period}
        />
        <LeaderboardSummary model={model} />
        <AccountRankings rows={model.rows} />
        <MethodologyNote assumptions={model.assumptions} />
      </section>
    </main>
  )
}

function LeaderboardHeader({
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

function LeaderboardSummary({ model }: { model: LeaderboardModel }) {
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

function AccountRankings({ rows }: { rows: LeaderboardAccountRow[] }) {
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
            No accounts were reconstructed from the fetched Predict events.
          </div>
        )}
      </div>
    </div>
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

function MethodologyNote({ assumptions }: { assumptions: string[] }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="px-4 py-3">
        <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Methodology
        </div>
        <div className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
          {assumptions.map((assumption) => (
            <p key={assumption}>{assumption}</p>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
