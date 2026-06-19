import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

import { Badge, BadgeTone } from "@/components/primitives/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPercent, formatRelativeTime, formatUsd } from "@/lib/format"
import { buildLeaderboardReport } from "@/lib/leaderboard/calculations"
import type {
  LeaderboardAccountRow,
  LeaderboardModel,
} from "@/lib/leaderboard/types"
import { cn } from "@/lib/utils"

export interface LeaderboardPageProps {
  model: LeaderboardModel
}

const compactUsdFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
})

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
})

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatSignedUsd(value: number) {
  if (value > 0) {
    return `+${formatUsd(value)}`
  }

  if (value < 0) {
    return `-${formatUsd(Math.abs(value))}`
  }

  return formatUsd(0)
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

function exportLeaderboardReport(model: LeaderboardModel) {
  const report = buildLeaderboardReport(model)
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = `callit-predict-leaderboard-${report.generatedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function Page({ model }: LeaderboardPageProps) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <LeaderboardHeader model={model} />

        <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <LeaderboardChart rows={model.rows} />
          <LeaderboardTotals model={model} />
        </div>

        <LeaderboardTable rows={model.rows} />

        <AssumptionsCard assumptions={model.assumptions} />
      </section>
    </main>
  )
}

function LeaderboardHeader({ model }: { model: LeaderboardModel }) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-card px-3 py-3 shadow-none ring-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            Predict Leaderboard
          </h1>
          <Badge className="px-2 py-0.5 text-[10px]" tone={BadgeTone.Warning}>
            Estimated
          </Badge>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Rank public Predict accounts by estimated volume, realized PnL, and
          activity from server events.
        </p>
        <div className="mt-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Built from public Predict data{" "}
          {formatRelativeTime(model.generatedAtMs)}
        </div>
      </div>

      <Button
        className="w-full sm:w-auto"
        size="sm"
        type="button"
        onClick={() => exportLeaderboardReport(model)}
      >
        Export Leaderboard
      </Button>
    </div>
  )
}

function LeaderboardTotals({ model }: { model: LeaderboardModel }) {
  const leader = model.rows.at(0)

  return (
    <Card className="h-full rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">
          Leaderboard Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4 px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          <MetricTile
            label="Accounts"
            value={model.totals.accounts.toLocaleString("en-US")}
          />
          <MetricTile
            label="Activity"
            value={model.totals.activityCount.toLocaleString("en-US")}
          />
          <MetricTile
            label="Volume"
            value={formatUsd(model.totals.volumeUsd)}
          />
          <MetricTile
            className={getPnlClassName(model.totals.realizedPnlUsd)}
            label="Realized PnL"
            value={formatSignedUsd(model.totals.realizedPnlUsd)}
          />
        </div>

        {leader ? (
          <div className="mt-auto rounded-md bg-muted/35 px-3 py-3">
            <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              Current leader
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-sm text-foreground">
                  {formatAddress(leader.account)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {leader.activityCount} public actions
                </div>
              </div>
              <div
                className={cn(
                  "font-mono text-sm tabular-nums",
                  getPnlClassName(leader.realizedPnlUsd)
                )}
              >
                {formatSignedUsd(leader.realizedPnlUsd)}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function MetricTile({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/35 px-2.5 py-2">
      <div className="truncate font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-xs font-medium text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}

function LeaderboardChart({ rows }: { rows: LeaderboardAccountRow[] }) {
  const chartRows = rows.slice(0, 10).map((row) => ({
    account: `#${row.rank}`,
    pnl: row.realizedPnlUsd,
    volume: row.volumeUsd,
  }))

  return (
    <Card className="h-full rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-end justify-between gap-3">
          <CardTitle className="text-sm font-medium">Top Accounts</CardTitle>
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Realized PnL by rank
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 py-3">
        <div className="h-64 rounded-md bg-background/35 px-3 py-3">
          {chartRows.length > 0 ? (
            <ResponsiveContainer
              height="100%"
              initialDimension={{ height: 256, width: 760 }}
              width="100%"
            >
              <BarChart
                data={chartRows}
                margin={{ bottom: 0, left: 0, right: 12, top: 10 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  axisLine={false}
                  dataKey="account"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickFormatter={(value) =>
                    typeof value === "number"
                      ? compactUsdFormatter.format(value)
                      : ""
                  }
                  tickLine={false}
                  width={58}
                />
                <Bar
                  dataKey="pnl"
                  fill="var(--primary)"
                  isAnimationActive={false}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No leaderboard activity is available yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function LeaderboardTable({ rows }: { rows: LeaderboardAccountRow[] }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle className="text-sm font-medium">
            Account Rankings
          </CardTitle>
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Estimated from public events
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <div className="hidden border-b border-border/40 bg-muted/35 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:grid lg:grid-cols-[4rem_minmax(11rem,1fr)_7rem_7rem_5rem_7rem_6rem_6rem_6rem] lg:items-center">
          <span>Rank</span>
          <span>Account</span>
          <span className="text-right">Volume</span>
          <span className="text-right">Realized</span>
          <span className="text-right">ROI</span>
          <span className="text-right">Open cost</span>
          <span className="text-right">Win rate</span>
          <span className="text-right">Actions</span>
          <span className="text-right">Last</span>
        </div>
        <div className="divide-y divide-border/25">
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
      </CardContent>
    </Card>
  )
}

function LeaderboardRow({ row }: { row: LeaderboardAccountRow }) {
  return (
    <div className="grid gap-1.5 px-3 py-2.5 text-xs lg:grid-cols-[4rem_minmax(11rem,1fr)_7rem_7rem_5rem_7rem_6rem_6rem_6rem] lg:items-center lg:gap-0 lg:py-2">
      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="font-mono text-sm font-medium text-primary tabular-nums">
          #{row.rank}
        </span>
        <span className="font-mono text-muted-foreground lg:hidden">
          {row.activityCount} actions
        </span>
      </div>
      <div className="min-w-0">
        <div className="truncate font-mono text-foreground">
          {formatAddress(row.account)}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase">
          {row.directionalCount} dir · {row.rangeCount} range
        </div>
      </div>
      <LabeledValue label="Volume" value={formatUsd(row.volumeUsd)} />
      <LabeledValue
        className={getPnlClassName(row.realizedPnlUsd)}
        label="Realized"
        value={formatSignedUsd(row.realizedPnlUsd)}
      />
      <LabeledValue
        className={
          row.realizedPnlPct === null
            ? "text-muted-foreground"
            : getPnlClassName(row.realizedPnlPct)
        }
        label="ROI"
        value={formatOptionalPercent(row.realizedPnlPct)}
      />
      <LabeledValue label="Open cost" value={formatUsd(row.openCostBasisUsd)} />
      <LabeledValue
        label="Win rate"
        value={formatOptionalPercent(row.winRate)}
      />
      <LabeledValue
        label="Actions"
        value={compactNumberFormatter.format(row.activityCount)}
      />
      <div className="font-mono text-muted-foreground tabular-nums lg:text-right">
        {row.lastActivityAtMs > 0
          ? formatRelativeTime(row.lastActivityAtMs)
          : "--"}
      </div>
    </div>
  )
}

function LabeledValue({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 font-mono text-foreground tabular-nums lg:block lg:text-right">
      <span className="text-muted-foreground lg:hidden">{label}</span>
      <span className={className}>{value}</span>
    </div>
  )
}

function AssumptionsCard({ assumptions }: { assumptions: string[] }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">Methodology</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 px-3 py-3 md:grid-cols-2">
        {assumptions.map((assumption) => (
          <div
            className="rounded-md bg-muted/35 px-3 py-2 text-xs leading-5 text-muted-foreground"
            key={assumption}
          >
            {assumption}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
