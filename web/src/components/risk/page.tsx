import { useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

import { Badge, BadgeTone } from "@/components/primitives/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

function getScenarioToneClassName(tone: RiskScenarioTone) {
  switch (tone) {
    case "down":
      return "border-outcome-down/25 bg-outcome-down/8 text-outcome-down"
    case "up":
      return "border-outcome-up/25 bg-outcome-up/8 text-outcome-up"
    case "warning":
      return "border-chart-4/25 bg-chart-4/8 text-chart-4"
    case "muted":
      return "border-border/35 bg-muted/35 text-foreground"
  }
}

function getWorstScenario(rows: RiskScenarioRow[]) {
  return rows.reduce((worstRow, row) =>
    row.drawdownPct > worstRow.drawdownPct ? row : worstRow
  )
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
        <RiskSnapshot model={model} />
        <SimulationLab
          model={model}
          onScenarioChange={setSelectedScenarioId}
          selectedScenario={selectedScenario}
        />
        <ChartWorkspace model={model} />
        <ScenarioMatrix rows={model.scenarioRows} />
        <ExposureExplorer model={model} />
        <VaultAccounting model={model} />
        <ModelNotes assumptions={model.assumptions} />
      </section>
    </main>
  )
}

function RiskHeader({ model }: { model: RiskModel }) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-card px-3 py-3 shadow-none ring-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            PLP Risk Studio
          </h1>
          <Badge className="px-2 py-0.5 text-[10px]" tone={BadgeTone.Warning}>
            Estimated
          </Badge>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Stress test Predict PLP under configurable settlement scenarios.
        </p>
        <div className="mt-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Public Predict data updated {formatRelativeTime(model.latestUpdatedAtMs)}
        </div>
      </div>

      <Button
        className="w-full sm:w-auto"
        onClick={() => exportRiskReport(model)}
        size="sm"
        type="button"
      >
        Export Risk Report
      </Button>
    </div>
  )
}

function RiskSnapshot({ model }: { model: RiskModel }) {
  const worstScenario = getWorstScenario(model.scenarioRows)

  return (
    <SectionCard title="Risk Snapshot">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SnapshotMetric
          label="Vault Value"
          meta="Current PLP NAV"
          value={formatQuoteAmount(model.summary.vault_value)}
        />
        <SnapshotMetric
          label="Withdrawable"
          meta="Current liquidity"
          value={formatQuoteAmount(model.summary.available_withdrawal)}
        />
        <SnapshotMetric
          label="Max Payout Util"
          meta="Open payout pressure"
          value={formatPercent(model.summary.max_payout_utilization)}
        />
        <SnapshotMetric
          className={getDrawdownClassName(worstScenario.drawdownPct)}
          label="Worst Drawdown"
          meta={worstScenario.label}
          value={formatPercent(worstScenario.drawdownPct)}
        />
      </div>
    </SectionCard>
  )
}

function SnapshotMetric({
  className,
  label,
  meta,
  value,
}: {
  className?: string
  label: string
  meta: string
  value: string
}) {
  return (
    <div className="rounded-md bg-muted/35 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-medium text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {meta}
      </div>
    </div>
  )
}

function SimulationLab({
  model,
  onScenarioChange,
  selectedScenario,
}: {
  model: RiskModel
  onScenarioChange: (scenarioId: RiskScenarioId) => void
  selectedScenario: RiskScenarioRow
}) {
  const [selectedGroup, setSelectedGroup] = useState<RiskScenarioGroup>("downside")
  const visibleRows = model.scenarioRows.filter(
    (row) => row.group === selectedGroup
  )

  return (
    <SectionCard title="Simulation Lab">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {scenarioGroups.map((group) => (
            <Button
              className={cn(
                "h-7 px-2.5 text-[11px] shadow-none",
                selectedGroup === group.id && "bg-primary/10 text-primary"
              )}
              key={group.id}
              onClick={() => setSelectedGroup(group.id)}
              size="xs"
              type="button"
              variant="ghost"
            >
              {group.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {visibleRows.map((row) => {
            const isSelected = row.id === selectedScenario.id

            return (
              <button
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  getScenarioToneClassName(row.tone),
                  isSelected ? "ring-1 ring-primary/40" : "hover:bg-accent/30"
                )}
                key={row.id}
                onClick={() => onScenarioChange(row.id)}
                type="button"
              >
                <div className="truncate text-xs font-medium">{row.label}</div>
                <div className="mt-2 font-mono text-sm font-medium tabular-nums">
                  {formatPercent(row.drawdownPct)} DD
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground uppercase">
                  {formatDusdc(row.estimatedLiability, 0)} liability
                </div>
              </button>
            )
          })}
        </div>

        <SelectedScenarioPanel row={selectedScenario} />
      </div>
    </SectionCard>
  )
}

function SelectedScenarioPanel({ row }: { row: RiskScenarioRow }) {
  return (
    <div className="rounded-md bg-background/35 px-3 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">{row.label}</div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {row.description}
          </p>
        </div>
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {row.shockSummary}
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <DetailMetric label="Shock" value={formatPercent(row.primaryShockPercent)} />
        <DetailMetric
          label="Settlement"
          value={formatUsd(row.estimatedSettlementPriceUsd, 0)}
        />
        <DetailMetric label="Liability" value={formatDusdc(row.estimatedLiability)} />
        <DetailMetric label="Vault Value" value={formatDusdc(row.estimatedVaultValue)} />
        <DetailMetric label="PLP Price" value={formatSharePrice(row.estimatedSharePrice)} />
        <DetailMetric
          className={getDrawdownClassName(row.drawdownPct)}
          label="Drawdown"
          value={formatPercent(row.drawdownPct)}
        />
      </div>
    </div>
  )
}

function ChartWorkspace({ model }: { model: RiskModel }) {
  const [metric, setMetric] = useState<ChartMetric>("drawdown")
  const chartRows = model.scenarioRows.map((row) => ({
    ...row,
    chartValue: getChartValue(row, metric),
  }))

  return (
    <SectionCard title="Chart Workspace">
      <div className="space-y-3">
        <Tabs
          onValueChange={(value) => setMetric(value as ChartMetric)}
          value={metric}
        >
          <TabsList className="h-8 rounded-md bg-muted p-0.5">
            {chartMetrics.map((chartMetric) => (
              <TabsTrigger
                className="text-xs"
                key={chartMetric.id}
                value={chartMetric.id}
              >
                {chartMetric.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="h-72 rounded-md bg-background/35 px-3 py-3">
          <ResponsiveContainer
            height="100%"
            initialDimension={{ height: 288, width: 900 }}
            width="100%"
          >
            <AreaChart
              data={chartRows}
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
                    stopColor="var(--chart-1)"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="label"
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
              <Area
                dataKey="chartValue"
                fill="url(#riskMetricGradient)"
                isAnimationActive={false}
                stroke="var(--chart-1)"
                strokeWidth={2}
                type="monotone"
              />
              <Line
                dataKey="chartValue"
                dot={false}
                isAnimationActive={false}
                stroke="var(--chart-1)"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </SectionCard>
  )
}

function ScenarioMatrix({ rows }: { rows: RiskScenarioRow[] }) {
  return (
    <SectionCard title="Scenario Matrix">
      <div className="overflow-hidden rounded-md bg-background/35">
        <div className="hidden border-b border-border/40 bg-muted/35 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[minmax(8rem,1fr)_6.25rem_7rem_7rem_7rem_5rem] md:items-center">
          <span>Scenario</span>
          <span className="text-right">Settle</span>
          <span className="text-right">Liability</span>
          <span className="text-right">Vault</span>
          <span className="text-right">PLP price</span>
          <span className="text-right">Drawdown</span>
        </div>
        <div className="divide-y divide-border/25">
          {rows.map((row) => (
            <ScenarioRow key={row.id} row={row} />
          ))}
        </div>
      </div>
    </SectionCard>
  )
}

function ScenarioRow({ row }: { row: RiskScenarioRow }) {
  return (
    <div className="grid gap-1.5 px-3 py-2.5 text-xs md:grid-cols-[minmax(8rem,1fr)_6.25rem_7rem_7rem_7rem_5rem] md:items-center md:gap-0 md:py-2">
      <div className="flex items-center justify-between gap-3 md:block">
        <span className="font-medium text-foreground">{row.label}</span>
        <span className="font-mono text-muted-foreground md:hidden">
          {row.shockSummary}
        </span>
      </div>
      <LabeledValue
        label="Settle"
        value={formatUsd(row.estimatedSettlementPriceUsd, 0)}
      />
      <LabeledValue label="Liability" value={formatDusdc(row.estimatedLiability, 0)} />
      <LabeledValue label="Vault" value={formatDusdc(row.estimatedVaultValue, 0)} />
      <LabeledValue label="PLP price" value={formatSharePrice(row.estimatedSharePrice)} />
      <LabeledValue
        className={getDrawdownClassName(row.drawdownPct)}
        label="Drawdown"
        value={formatPercent(row.drawdownPct)}
      />
    </div>
  )
}

function ExposureExplorer({ model }: { model: RiskModel }) {
  const [filter, setFilter] = useState<ExposureFilter>("all")
  const [page, setPage] = useState(0)
  const filteredRows = model.exposureRows.filter(
    (row) => filter === "all" || row.kind === filter
  )
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / exposurePageSize))
  const visibleRows = filteredRows.slice(
    page * exposurePageSize,
    page * exposurePageSize + exposurePageSize
  )

  function selectFilter(nextFilter: ExposureFilter) {
    setFilter(nextFilter)
    setPage(0)
  }

  return (
    <SectionCard title="Exposure Explorer">
      <div className="space-y-3">
        {model.hasIncompleteReconstruction ? (
          <div className="rounded-md bg-chart-4/10 px-3 py-2 text-xs leading-5 text-chart-4">
            Event reconstruction may be incomplete; scenario estimates use total
            max payout as a stress anchor.
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {(["all", "directional", "range"] as ExposureFilter[]).map((option) => (
            <Button
              className={cn(
                "h-7 px-2.5 text-[11px] shadow-none capitalize",
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
          ))}
        </div>

        <ExposureTable rows={visibleRows} />

        {filteredRows.length > exposurePageSize ? (
          <div className="flex items-center justify-between border-t border-border/40 pt-2">
            <Button
              disabled={page === 0}
              onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
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
                setPage((currentPage) => Math.min(pageCount - 1, currentPage + 1))
              }
              size="xs"
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  )
}

function ExposureTable({ rows }: { rows: RiskExposureRow[] }) {
  return (
    <div className="overflow-hidden rounded-md bg-background/35">
      <div className="hidden border-b border-border/40 bg-muted/35 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:grid lg:grid-cols-[minmax(13rem,1.4fr)_5rem_7rem_7rem_7rem_7rem_6rem] lg:items-center">
        <span>Market</span>
        <span>Kind</span>
        <span className="text-right">Open qty</span>
        <span className="text-right">Cost</span>
        <span className="text-right">Max payout</span>
        <span className="text-right">Est. payout</span>
        <span className="text-right">Expiry</span>
      </div>
      <div className="divide-y divide-border/25">
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
    <div className="grid gap-1.5 px-3 py-2.5 text-xs lg:grid-cols-[minmax(13rem,1.4fr)_5rem_7rem_7rem_7rem_7rem_6rem] lg:items-center lg:gap-0 lg:py-2">
      <div className="min-w-0">
        <div className="truncate text-foreground">
          {row.assetSymbol} - {row.settlementLabel}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase">
          {row.oracleId.slice(0, 8)}...{row.oracleId.slice(-4)}
        </div>
      </div>
      <div className="font-mono text-[10px] text-primary uppercase">
        {row.kind === "directional" ? "DIR" : "RNG"}
      </div>
      <LabeledValue
        label="Open qty"
        value={row.openQuantity.toLocaleString("en-US", {
          maximumFractionDigits: 4,
        })}
      />
      <LabeledValue label="Cost" value={formatDusdc(row.costBasisUsd)} />
      <LabeledValue label="Max payout" value={formatDusdc(row.maxPayoutUsd)} />
      <LabeledValue label="Est. payout" value={formatDusdc(row.payoutEstimateUsd)} />
      <div className="font-mono text-muted-foreground tabular-nums lg:text-right">
        {formatExpiryDate(row.expiryMs)}
      </div>
    </div>
  )
}

function VaultAccounting({ model }: { model: RiskModel }) {
  const summary = model.summary
  const metrics = [
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
    { label: "Total Supplied", value: formatQuoteAmount(summary.total_supplied) },
    { label: "Total Withdrawn", value: formatQuoteAmount(summary.total_withdrawn) },
    { label: "Net Deposits", value: formatQuoteAmount(summary.net_deposits) },
  ]

  return (
    <SectionCard title="Vault Accounting">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {metrics.map((metric) => (
          <DetailMetric
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </div>
    </SectionCard>
  )
}

function ModelNotes({ assumptions }: { assumptions: string[] }) {
  return (
    <SectionCard title="Model Notes">
      <div className="grid gap-2 md:grid-cols-2">
        {assumptions.map((assumption) => (
          <div
            className="rounded-md bg-muted/35 px-3 py-2 text-xs leading-5 text-muted-foreground"
            key={assumption}
          >
            {assumption}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function SectionCard({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 py-3">{children}</CardContent>
    </Card>
  )
}

function DetailMetric({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className="rounded-md bg-muted/35 px-2.5 py-2">
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
