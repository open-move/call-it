import { useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

import { Badge, BadgeTone } from "@/components/primitives/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { QUOTE_SCALE } from "@/lib/config"
import {
  formatExpiryDate,
  formatPercent,
  formatRelativeTime,
  formatUsd,
} from "@/lib/format"
import { buildRiskReport } from "@/lib/risk/calculations"
import type {
  RiskExposureKind,
  RiskExposureRow,
  RiskModel,
  RiskScenarioGroup,
  RiskScenarioId,
  RiskScenarioRow,
  RiskScenarioTone,
} from "@/lib/risk/types"
import { cn } from "@/lib/utils"

export interface RiskPageProps {
  model: RiskModel
}

type ChartMetric = "drawdown" | "liability" | "plpPrice" | "vaultValue"
type ExposureFilter = "all" | RiskExposureKind

const exposurePageSize = 12

const scenarioGroups = [
  { id: "core", label: "Core" },
  { id: "downside", label: "Downside" },
  { id: "upside", label: "Upside" },
  { id: "stress", label: "Stress" },
] satisfies { id: RiskScenarioGroup; label: string }[]

const chartMetrics = [
  { id: "drawdown", label: "Drawdown" },
  { id: "liability", label: "Liability" },
  { id: "plpPrice", label: "PLP Price" },
  { id: "vaultValue", label: "Vault Value" },
] satisfies { id: ChartMetric; label: string }[]

const sharePriceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
  minimumFractionDigits: 6,
})

const compactPercentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  style: "percent",
})

function toQuoteAmount(value: number) {
  return value / QUOTE_SCALE
}

function formatTokenAmount(
  value: number,
  symbol: string,
  maximumFractionDigits = 4
) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })} ${symbol}`
}

function formatQuoteAmount(value: number, symbol = "DUSDC") {
  return formatTokenAmount(toQuoteAmount(value), symbol)
}

function formatDusdc(value: number, maximumFractionDigits = 2) {
  return formatTokenAmount(value, "DUSDC", maximumFractionDigits)
}

function formatSharePrice(value: number) {
  return `${sharePriceFormatter.format(value)} DUSDC`
}

function getDrawdownClassName(value: number) {
  if (value <= 0) {
    return "text-muted-foreground"
  }

  return value >= 0.12 ? "text-outcome-down" : "text-chart-4"
}

function getScenarioAccentClassName(tone: RiskScenarioTone) {
  switch (tone) {
    case "down":
      return "text-outcome-down"
    case "up":
      return "text-outcome-up"
    case "warning":
      return "text-chart-4"
    case "muted":
      return "text-muted-foreground"
  }
}

function getWorstScenario(rows: RiskScenarioRow[]) {
  return rows.reduce((worstRow, row) =>
    row.drawdownPct > worstRow.drawdownPct ? row : worstRow
  )
}

function getSeverityPercent(row: RiskScenarioRow) {
  return Math.min(Math.max(row.drawdownPct / 0.4, 0), 1) * 100
}

function getExposureSummary(rows: RiskExposureRow[]) {
  const directionalMaxPayout = rows
    .filter((row) => row.kind === "directional")
    .reduce((total, row) => total + row.maxPayoutUsd, 0)
  const rangeMaxPayout = rows
    .filter((row) => row.kind === "range")
    .reduce((total, row) => total + row.maxPayoutUsd, 0)
  const largestExposure = rows.reduce<RiskExposureRow | undefined>(
    (largestRow, row) =>
      !largestRow || row.maxPayoutUsd > largestRow.maxPayoutUsd
        ? row
        : largestRow,
    undefined
  )

  return {
    directionalMaxPayout,
    largestExposure,
    rangeMaxPayout,
    totalMaxPayout: directionalMaxPayout + rangeMaxPayout,
  }
}

function getChartValue(row: RiskScenarioRow, metric: ChartMetric) {
  switch (metric) {
    case "drawdown":
      return row.drawdownPct
    case "liability":
      return row.estimatedLiability
    case "plpPrice":
      return row.estimatedSharePrice
    case "vaultValue":
      return row.estimatedVaultValue
  }
}

function formatChartTick(value: number, metric: ChartMetric) {
  switch (metric) {
    case "drawdown":
      return compactPercentFormatter.format(value)
    case "liability":
    case "vaultValue":
      return value >= 1_000 ? `${Math.round(value / 1_000)}k` : value.toFixed(0)
    case "plpPrice":
      return value.toFixed(4)
  }
}

function exportRiskReport(model: RiskModel) {
  const report = buildRiskReport(model)
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = `callit-plp-risk-report-${report.generatedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function Page({ model }: RiskPageProps) {
  const defaultScenario =
    model.scenarioRows.find((row) => row.id === "btc-crash-25") ??
    model.scenarioRows[0]
  const [selectedScenarioId, setSelectedScenarioId] = useState<RiskScenarioId>(
    defaultScenario.id
  )
  const selectedScenario =
    model.scenarioRows.find((row) => row.id === selectedScenarioId) ??
    defaultScenario

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <RiskHeader model={model} />
        <RiskCockpit
          model={model}
          onScenarioChange={setSelectedScenarioId}
          selectedScenario={selectedScenario}
        />
        <ExposureBook model={model} />
        <AuditTape model={model} />
      </section>
    </main>
  )
}

function RiskHeader({ model }: { model: RiskModel }) {
  return (
    <div className="rounded-md bg-card px-4 py-3 shadow-none ring-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
              Risk Console
            </h1>
            <Badge className="px-2 py-0.5 text-[10px]" tone={BadgeTone.Warning}>
              Model output
            </Badge>
            <Badge className="px-2 py-0.5 text-[10px]" tone={BadgeTone.Neutral}>
              Public data
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
            PLP liability cockpit for scenario shocks, max payout pressure, and
            reconstructed Predict exposure.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase tabular-nums">
            <span>Updated {formatRelativeTime(model.latestUpdatedAtMs)}</span>
            <span>
              Reconstruction{" "}
              {model.hasIncompleteReconstruction ? "partial" : "complete"}
            </span>
          </div>
        </div>

        <Button
          className="w-full sm:w-auto"
          onClick={() => exportRiskReport(model)}
          size="sm"
          type="button"
          variant="outline"
        >
          Export Risk Report
        </Button>
      </div>
    </div>
  )
}

function RiskCockpit({
  model,
  onScenarioChange,
  selectedScenario,
}: {
  model: RiskModel
  onScenarioChange: (scenarioId: RiskScenarioId) => void
  selectedScenario: RiskScenarioRow
}) {
  const [selectedGroup, setSelectedGroup] = useState<RiskScenarioGroup>(
    selectedScenario.group
  )
  const [metric, setMetric] = useState<ChartMetric>("drawdown")
  const worstScenario = getWorstScenario(model.scenarioRows)
  const visibleRows = model.scenarioRows.filter(
    (row) => row.group === selectedGroup
  )
  const chartRows = model.scenarioRows.map((row) => ({
    ...row,
    chartValue: getChartValue(row, metric),
  }))

  function selectGroup(nextGroup: RiskScenarioGroup) {
    setSelectedGroup(nextGroup)

    const firstScenario = model.scenarioRows.find(
      (row) => row.group === nextGroup
    )

    if (firstScenario) {
      onScenarioChange(firstScenario.id)
    }
  }

  return (
    <Card className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <RiskRail model={model} worstScenario={worstScenario} />

        <div className="grid min-h-[34rem] gap-0 xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
          <ScenarioStack
            onGroupChange={selectGroup}
            onScenarioChange={onScenarioChange}
            rows={visibleRows}
            selectedGroup={selectedGroup}
            selectedScenario={selectedScenario}
          />
          <ScenarioChartPanel
            metric={metric}
            onMetricChange={setMetric}
            rows={chartRows}
            selectedScenario={selectedScenario}
          />
          <ScenarioReadout
            selectedScenario={selectedScenario}
            worstScenario={worstScenario}
          />
        </div>

        <ScenarioComparison rows={model.scenarioRows} />
      </CardContent>
    </Card>
  )
}

function RiskRail({
  model,
  worstScenario,
}: {
  model: RiskModel
  worstScenario: RiskScenarioRow
}) {
  return (
    <div className="grid border-b border-border/45 bg-muted/10 md:grid-cols-4">
      <RailCell
        label="Vault value"
        meta="Current PLP NAV"
        value={formatQuoteAmount(model.summary.vault_value)}
      />
      <RailCell
        label="Withdrawable"
        meta="Current liquidity"
        value={formatQuoteAmount(model.summary.available_withdrawal)}
      />
      <RailCell
        label="Open max payout"
        meta={`${formatPercent(model.summary.max_payout_utilization)} utilization`}
        value={formatQuoteAmount(model.summary.total_max_payout)}
      />
      <RailCell
        className={getDrawdownClassName(worstScenario.drawdownPct)}
        emphasis
        label="Worst drawdown"
        meta={worstScenario.label}
        value={formatPercent(worstScenario.drawdownPct)}
      />
    </div>
  )
}

function RailCell({
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

function ScenarioStack({
  onGroupChange,
  onScenarioChange,
  rows,
  selectedGroup,
  selectedScenario,
}: {
  onGroupChange: (group: RiskScenarioGroup) => void
  onScenarioChange: (scenarioId: RiskScenarioId) => void
  rows: RiskScenarioRow[]
  selectedGroup: RiskScenarioGroup
  selectedScenario: RiskScenarioRow
}) {
  return (
    <aside className="border-b border-border/45 xl:border-r xl:border-b-0">
      <div className="border-b border-border/35 px-3 py-3">
        <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Scenario Stack
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {scenarioGroups.map((group) => (
            <Button
              className={cn(
                "h-7 px-2.5 text-[11px] shadow-none",
                selectedGroup === group.id && "bg-primary/10 text-primary"
              )}
              key={group.id}
              onClick={() => onGroupChange(group.id)}
              size="xs"
              type="button"
              variant="ghost"
            >
              {group.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-border/30">
        {rows.map((row) => (
          <ScenarioStackRow
            key={row.id}
            onSelect={() => onScenarioChange(row.id)}
            row={row}
            selected={row.id === selectedScenario.id}
          />
        ))}
      </div>
    </aside>
  )
}

function ScenarioStackRow({
  onSelect,
  row,
  selected,
}: {
  onSelect: () => void
  row: RiskScenarioRow
  selected: boolean
}) {
  return (
    <button
      className={cn(
        "w-full px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
        selected ? "bg-primary/10" : "hover:bg-muted/25"
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-xs font-medium text-foreground">
          {row.label}
        </span>
        <span
          className={cn(
            "font-mono text-[10px] uppercase tabular-nums",
            getScenarioAccentClassName(row.tone)
          )}
        >
          {formatPercent(row.drawdownPct)}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-background/80">
        <div
          className={cn(
            "h-full rounded-full",
            row.drawdownPct >= 0.12 ? "bg-outcome-down" : "bg-chart-4"
          )}
          style={{ width: `${getSeverityPercent(row)}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
        <span className="truncate">{row.shockSummary}</span>
        <span>{formatDusdc(row.estimatedLiability, 0)}</span>
      </div>
    </button>
  )
}

function ScenarioChartPanel({
  metric,
  onMetricChange,
  rows,
  selectedScenario,
}: {
  metric: ChartMetric
  onMetricChange: (metric: ChartMetric) => void
  rows: Array<RiskScenarioRow & { chartValue: number }>
  selectedScenario: RiskScenarioRow
}) {
  return (
    <section className="min-w-0 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            Shock Curve
          </div>
          <p className="mt-2 max-w-xl text-xs leading-5 text-muted-foreground">
            Scenario estimates use public oracle marks and reconstructed open
            payout exposure.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chartMetrics.map((chartMetric) => (
            <Button
              className={cn(
                "h-7 px-2.5 text-[11px] shadow-none",
                metric === chartMetric.id && "bg-primary/10 text-primary"
              )}
              key={chartMetric.id}
              onClick={() => onMetricChange(chartMetric.id)}
              size="xs"
              type="button"
              variant="ghost"
            >
              {chartMetric.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-72 rounded-md border border-border/35 bg-muted/15 px-3 py-3 sm:h-80">
        <ResponsiveContainer
          height="100%"
          initialDimension={{ height: 320, width: 900 }}
          width="100%"
        >
          <AreaChart
            data={rows}
            margin={{ bottom: 0, left: 0, right: 12, top: 10 }}
          >
            <defs>
              <linearGradient
                id="riskMetricGradient"
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor="var(--primary)"
                  stopOpacity={0.24}
                />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              strokeOpacity={0.7}
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="label"
              minTickGap={18}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(value) =>
                typeof value === "number" ? formatChartTick(value, metric) : ""
              }
              tickLine={false}
              width={58}
            />
            <ReferenceLine
              stroke="var(--primary)"
              strokeDasharray="3 3"
              strokeOpacity={0.75}
              x={selectedScenario.label}
            />
            <Area
              dataKey="chartValue"
              fill="url(#riskMetricGradient)"
              isAnimationActive={false}
              stroke="var(--primary)"
              strokeWidth={2.25}
              type="monotone"
            />
            <Line
              dataKey="chartValue"
              dot={false}
              isAnimationActive={false}
              stroke="var(--primary)"
              strokeWidth={2.25}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function ScenarioReadout({
  selectedScenario,
  worstScenario,
}: {
  selectedScenario: RiskScenarioRow
  worstScenario: RiskScenarioRow
}) {
  return (
    <aside className="border-t border-border/45 px-4 py-4 xl:border-t-0 xl:border-l">
      <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
        Selected Shock
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {selectedScenario.description}
      </p>

      <div className="mt-4 rounded-md border border-border/35 bg-muted/15 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-foreground">
              {selectedScenario.label}
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {selectedScenario.shockSummary}
            </div>
          </div>
          <div
            className={cn(
              "font-mono text-xl leading-tight font-medium tabular-nums",
              getDrawdownClassName(selectedScenario.drawdownPct)
            )}
          >
            {formatPercent(selectedScenario.drawdownPct)}
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background/80">
          <div
            className="h-full rounded-full bg-outcome-down"
            style={{ width: `${getSeverityPercent(selectedScenario)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 space-y-2 rounded-md border border-border/35 bg-muted/15 p-3">
        <ReadoutRow
          label="Settlement"
          value={formatUsd(selectedScenario.estimatedSettlementPriceUsd, 0)}
        />
        <ReadoutRow
          label="Liability"
          value={formatDusdc(selectedScenario.estimatedLiability)}
        />
        <ReadoutRow
          label="Vault value"
          value={formatDusdc(selectedScenario.estimatedVaultValue)}
        />
        <ReadoutRow
          label="PLP price"
          value={formatSharePrice(selectedScenario.estimatedSharePrice)}
        />
      </div>

      <div className="mt-3 rounded-md border border-border/35 bg-muted/15 p-3">
        <div className="text-xs font-medium text-foreground">Worst modeled</div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="truncate text-xs text-muted-foreground">
            {worstScenario.label}
          </span>
          <span
            className={cn(
              "font-mono text-xs font-medium tabular-nums",
              getDrawdownClassName(worstScenario.drawdownPct)
            )}
          >
            {formatPercent(worstScenario.drawdownPct)}
          </span>
        </div>
      </div>
    </aside>
  )
}

function ReadoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}

function ScenarioComparison({ rows }: { rows: RiskScenarioRow[] }) {
  return (
    <div className="border-t border-border/45">
      <div className="overflow-auto">
        <div className="min-w-[48rem]">
          <div className="grid grid-cols-[minmax(9rem,1fr)_6.5rem_7.5rem_7.5rem_7rem_6rem] gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            <span>Scenario</span>
            <span className="text-right">Settle</span>
            <span className="text-right">Liability</span>
            <span className="text-right">Vault</span>
            <span className="text-right">PLP price</span>
            <span className="text-right">Drawdown</span>
          </div>
          {rows.map((row) => (
            <ScenarioComparisonRow key={row.id} row={row} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ScenarioComparisonRow({ row }: { row: RiskScenarioRow }) {
  return (
    <div className="grid grid-cols-[minmax(9rem,1fr)_6.5rem_7.5rem_7.5rem_7rem_6rem] gap-4 border-b border-border/35 px-3 py-2 text-xs last:border-b-0">
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{row.label}</div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase">
          {row.shockSummary}
        </div>
      </div>
      <TableValue value={formatUsd(row.estimatedSettlementPriceUsd, 0)} />
      <TableValue value={formatDusdc(row.estimatedLiability, 0)} />
      <TableValue value={formatDusdc(row.estimatedVaultValue, 0)} />
      <TableValue value={formatSharePrice(row.estimatedSharePrice)} />
      <TableValue
        className={getDrawdownClassName(row.drawdownPct)}
        value={formatPercent(row.drawdownPct)}
      />
    </div>
  )
}

function ExposureBook({ model }: { model: RiskModel }) {
  const [filter, setFilter] = useState<ExposureFilter>("all")
  const [page, setPage] = useState(0)
  const exposureSummary = getExposureSummary(model.exposureRows)
  const filteredRows = model.exposureRows.filter(
    (row) => filter === "all" || row.kind === filter
  )
  const pageCount = Math.max(
    1,
    Math.ceil(filteredRows.length / exposurePageSize)
  )
  const visibleRows = filteredRows.slice(
    page * exposurePageSize,
    page * exposurePageSize + exposurePageSize
  )

  function selectFilter(nextFilter: ExposureFilter) {
    setFilter(nextFilter)
    setPage(0)
  }

  return (
    <Card className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
              Exposure Book
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Open directional and range positions reconstructed from public
              Predict events.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "directional", "range"] as ExposureFilter[]).map(
              (option) => (
                <Button
                  className={cn(
                    "h-7 px-2.5 text-[11px] capitalize shadow-none",
                    filter === option && "bg-primary/10 text-primary"
                  )}
                  key={option}
                  onClick={() => selectFilter(option)}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  {option === "all" ? "All" : option}
                </Button>
              )
            )}
          </div>
        </div>

        <ExposureSummary summary={exposureSummary} />

        {model.hasIncompleteReconstruction ? (
          <div className="border-t border-chart-4/25 bg-chart-4/10 px-4 py-2 text-xs leading-5 text-chart-4">
            Event reconstruction is partial. Scenario estimates use total max
            payout as the stress anchor where public event history is missing.
          </div>
        ) : null}

        <ExposureTable rows={visibleRows} />

        {filteredRows.length > exposurePageSize ? (
          <div className="flex items-center justify-between border-t border-border/45 px-3 py-2">
            <Button
              disabled={page === 0}
              onClick={() =>
                setPage((currentPage) => Math.max(0, currentPage - 1))
              }
              size="xs"
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
              Page {page + 1} / {pageCount}
            </div>
            <Button
              disabled={page >= pageCount - 1}
              onClick={() =>
                setPage((currentPage) =>
                  Math.min(pageCount - 1, currentPage + 1)
                )
              }
              size="xs"
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ExposureSummary({
  summary,
}: {
  summary: ReturnType<typeof getExposureSummary>
}) {
  return (
    <div className="grid border-t border-border/45 bg-muted/10 md:grid-cols-4">
      <RailCell
        label="Open max payout"
        meta="Reconstructed book"
        value={formatDusdc(summary.totalMaxPayout, 0)}
      />
      <RailCell
        label="Directional"
        meta="Up and Down positions"
        value={formatDusdc(summary.directionalMaxPayout, 0)}
      />
      <RailCell
        label="Range"
        meta="Inside-range positions"
        value={formatDusdc(summary.rangeMaxPayout, 0)}
      />
      <RailCell
        label="Largest line"
        meta={summary.largestExposure?.settlementLabel ?? "No exposure"}
        value={
          summary.largestExposure
            ? `${summary.largestExposure.assetSymbol} ${formatDusdc(
                summary.largestExposure.maxPayoutUsd,
                0
              )}`
            : "--"
        }
      />
    </div>
  )
}

function ExposureTable({ rows }: { rows: RiskExposureRow[] }) {
  return (
    <div className="overflow-auto border-t border-border/45">
      <div className="min-w-[58rem]">
        <div className="grid grid-cols-[minmax(14rem,1.5fr)_4rem_7rem_7rem_7.5rem_7.5rem_6rem] gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          <span>Market</span>
          <span>Kind</span>
          <span className="text-right">Open qty</span>
          <span className="text-right">Cost</span>
          <span className="text-right">Max payout</span>
          <span className="text-right">Est. payout</span>
          <span className="text-right">Expiry</span>
        </div>
        {rows.length > 0 ? (
          rows.map((row) => <ExposureRow key={row.id} row={row} />)
        ) : (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            No open exposure was reconstructed from recent public events.
          </div>
        )}
      </div>
    </div>
  )
}

function ExposureRow({ row }: { row: RiskExposureRow }) {
  return (
    <div className="grid grid-cols-[minmax(14rem,1.5fr)_4rem_7rem_7rem_7.5rem_7.5rem_6rem] gap-4 border-b border-border/35 px-3 py-2 text-xs last:border-b-0">
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">
          {row.assetSymbol} - {row.settlementLabel}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase">
          {row.oracleId.slice(0, 8)}...{row.oracleId.slice(-4)}
        </div>
      </div>
      <span className="font-mono text-[10px] tracking-wide text-primary uppercase">
        {row.kind === "directional" ? "DIR" : "RNG"}
      </span>
      <TableValue
        value={row.openQuantity.toLocaleString("en-US", {
          maximumFractionDigits: 4,
        })}
      />
      <TableValue value={formatDusdc(row.costBasisUsd)} />
      <TableValue value={formatDusdc(row.maxPayoutUsd)} />
      <TableValue value={formatDusdc(row.payoutEstimateUsd)} />
      <TableValue muted value={formatExpiryDate(row.expiryMs)} />
    </div>
  )
}

function AuditTape({ model }: { model: RiskModel }) {
  const summary = model.summary
  const accountingRows = [
    { label: "Vault Balance", value: formatQuoteAmount(summary.vault_balance) },
    { label: "Total MTM", value: formatQuoteAmount(summary.total_mtm) },
    {
      label: "Available Liquidity",
      value: formatQuoteAmount(summary.available_liquidity),
    },
    { label: "PLP Price", value: formatSharePrice(summary.plp_share_price) },
    {
      label: "PLP Supply",
      value: formatQuoteAmount(summary.plp_total_supply, "PLP"),
    },
    {
      label: "Total Supplied",
      value: formatQuoteAmount(summary.total_supplied),
    },
    {
      label: "Total Withdrawn",
      value: formatQuoteAmount(summary.total_withdrawn),
    },
    { label: "Net Deposits", value: formatQuoteAmount(summary.net_deposits) },
  ]

  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-3">
          <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            Audit Tape
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
            Raw vault accounting and model assumptions used by this console.
          </p>
        </div>

        <div className="grid border-t border-border/45 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="border-b border-border/45 px-4 py-3 lg:border-r lg:border-b-0">
            <div className="space-y-2 rounded-md border border-border/35 bg-muted/15 px-3 py-2">
              {accountingRows.map((row) => (
                <ReadoutRow
                  key={row.label}
                  label={row.label}
                  value={row.value}
                />
              ))}
            </div>
          </div>
          <div className="divide-y divide-border/30 px-4 py-3">
            {model.assumptions.map((assumption) => (
              <div
                className="py-2 text-xs leading-5 text-muted-foreground first:pt-0 last:pb-0"
                key={assumption}
              >
                {assumption}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
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
