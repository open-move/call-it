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
import { QUOTE_SCALE } from "@/lib/config"
import {
  formatExpiryDate,
  formatPercent,
  formatRelativeTime,
  formatUsd,
} from "@/lib/format"
import { buildRiskReport } from "@/lib/risk/calculations"
import type {
  RiskExposureRow,
  RiskModel,
  RiskScenarioRow,
} from "@/lib/risk/types"
import { cn } from "@/lib/utils"

export interface RiskPageProps {
  model: RiskModel
}

const sharePriceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
  minimumFractionDigits: 6,
})

const compactPercentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  style: "percent",
})

function toQuoteUsd(value: number) {
  return value / QUOTE_SCALE
}

function formatQuoteUsd(value: number, maximumFractionDigits = 2) {
  return formatUsd(toQuoteUsd(value), maximumFractionDigits)
}

function formatQuoteAmount(value: number, symbol = "DUSDC") {
  return `${toQuoteUsd(value).toLocaleString("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  })} ${symbol}`
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
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <RiskHeader model={model} />

        <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <PlpHealthCard model={model} />
          <WithdrawalLiquidityCard model={model} />
        </div>

        <ScenarioSimulatorCard rows={model.scenarioRows} />

        <ExposureBreakdownCard model={model} />

        <AssumptionsCard assumptions={model.assumptions} />
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
          Stress test DeepBook Predict PLP under settlement scenarios.
        </p>
        <div className="mt-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Public Predict data updated{" "}
          {formatRelativeTime(model.latestUpdatedAtMs)}
        </div>
      </div>

      <Button
        className="w-full sm:w-auto"
        size="sm"
        type="button"
        onClick={() => exportRiskReport(model)}
      >
        Export Risk Report
      </Button>
    </div>
  )
}

function PlpHealthCard({ model }: { model: RiskModel }) {
  const summary = model.summary

  return (
    <Card className="h-full rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-end justify-between gap-3">
          <CardTitle className="text-sm font-medium">PLP Health</CardTitle>
          <div className="font-mono text-sm font-medium text-foreground tabular-nums">
            {formatQuoteUsd(summary.vault_value)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 py-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <MetricTile
            label="Vault value"
            value={formatQuoteUsd(summary.vault_value)}
          />
          <MetricTile
            label="Vault balance"
            value={formatQuoteUsd(summary.vault_balance)}
          />
          <MetricTile
            label="Total MTM"
            value={formatQuoteUsd(summary.total_mtm)}
          />
          <MetricTile
            label="Max payout"
            value={formatQuoteUsd(summary.total_max_payout)}
          />
          <MetricTile
            label="Utilization"
            value={formatPercent(summary.utilization)}
          />
          <MetricTile
            label="Payout util"
            value={formatPercent(summary.max_payout_utilization)}
          />
          <MetricTile
            label="Withdrawable"
            value={formatQuoteUsd(summary.available_withdrawal)}
          />
          <MetricTile
            label="PLP price"
            value={formatSharePrice(summary.plp_share_price)}
          />
          <MetricTile
            label="PLP supply"
            value={formatQuoteAmount(summary.plp_total_supply, "PLP")}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function WithdrawalLiquidityCard({ model }: { model: RiskModel }) {
  const withdrawalPct = Math.max(Math.min(model.availableWithdrawalPct, 1), 0)

  return (
    <Card className="h-full rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">
          Withdrawal Liquidity
        </CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4 px-3 py-3">
        <div>
          <div className="text-xs text-muted-foreground">
            Available withdrawal
          </div>
          <div className="mt-1 font-mono text-2xl font-medium tracking-tight text-foreground tabular-nums">
            {formatQuoteUsd(model.summary.available_withdrawal)}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
            {formatPercent(model.availableWithdrawalPct)} of vault value
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${withdrawalPct * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            <span>Current liquidity</span>
            <span>{compactPercentFormatter.format(withdrawalPct)}</span>
          </div>
        </div>

        <p className="mt-auto rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
          This reflects current withdrawable liquidity only, not a
          future-outcome commitment.
        </p>
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

function ScenarioSimulatorCard({ rows }: { rows: RiskScenarioRow[] }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle className="text-sm font-medium">
            Scenario Simulator
          </CardTitle>
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Estimates from public data
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <div className="grid gap-3 px-3 py-3 xl:grid-cols-[minmax(0,1fr)_minmax(30rem,1.2fr)]">
          <ScenarioChart rows={rows} />
          <ScenarioTable rows={rows} />
        </div>
      </CardContent>
    </Card>
  )
}

function ScenarioChart({ rows }: { rows: RiskScenarioRow[] }) {
  return (
    <div className="min-h-72 rounded-md bg-background/35 px-3 py-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">
            PLP drawdown path
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Scenario drawdown against current share price.
          </div>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer
          height="100%"
          initialDimension={{ height: 224, width: 640 }}
          width="100%"
        >
          <AreaChart
            data={rows}
            margin={{ bottom: 0, left: 0, right: 12, top: 10 }}
          >
            <defs>
              <linearGradient
                id="riskDrawdownGradient"
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor="var(--outcome-down)"
                  stopOpacity={0.28}
                />
                <stop
                  offset="95%"
                  stopColor="var(--outcome-down)"
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
                typeof value === "number"
                  ? compactPercentFormatter.format(value)
                  : ""
              }
              tickLine={false}
              width={46}
            />
            <Area
              dataKey="drawdownPct"
              fill="url(#riskDrawdownGradient)"
              isAnimationActive={false}
              stroke="var(--outcome-down)"
              strokeWidth={2}
              type="monotone"
            />
            <Line
              dataKey="drawdownPct"
              dot={false}
              isAnimationActive={false}
              stroke="var(--outcome-down)"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ScenarioTable({ rows }: { rows: RiskScenarioRow[] }) {
  return (
    <div className="overflow-hidden rounded-md bg-background/35">
      <div className="hidden border-b border-border/40 bg-muted/35 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[4.5rem_6.25rem_7rem_7rem_7rem_5rem] md:items-center">
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
  )
}

function ScenarioRow({ row }: { row: RiskScenarioRow }) {
  return (
    <div className="grid gap-1.5 px-3 py-2.5 text-xs md:grid-cols-[4.5rem_6.25rem_7rem_7rem_7rem_5rem] md:items-center md:gap-0 md:py-2">
      <div className="flex items-center justify-between gap-3 md:block">
        <span className="font-mono font-medium text-foreground tabular-nums">
          {row.label}
        </span>
        <span className="font-mono text-muted-foreground md:hidden">
          {compactPercentFormatter.format(row.shockPercent)} shock
        </span>
      </div>
      <LabeledScenarioValue
        label="Settle"
        value={formatUsd(row.estimatedSettlementPriceUsd, 0)}
      />
      <LabeledScenarioValue
        label="Liability"
        value={formatUsd(row.estimatedLiability)}
      />
      <LabeledScenarioValue
        label="Vault"
        value={formatUsd(row.estimatedVaultValue)}
      />
      <LabeledScenarioValue
        label="PLP price"
        value={sharePriceFormatter.format(row.estimatedSharePrice)}
      />
      <LabeledScenarioValue
        className={getDrawdownClassName(row.drawdownPct)}
        label="Drawdown"
        value={formatPercent(row.drawdownPct)}
      />
    </div>
  )
}

function LabeledScenarioValue({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 font-mono text-foreground tabular-nums md:block md:text-right">
      <span className="text-muted-foreground md:hidden">{label}</span>
      <span className={className}>{value}</span>
    </div>
  )
}

function ExposureBreakdownCard({ model }: { model: RiskModel }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle className="text-sm font-medium">
            Exposure Breakdown
          </CardTitle>
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Estimated from public event data
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {model.hasIncompleteReconstruction ? (
          <div className="border-b border-border/40 bg-chart-4/10 px-3 py-2 text-xs leading-5 text-chart-4">
            Event reconstruction may be incomplete; scenario estimates use total
            max payout as a stress anchor.
          </div>
        ) : null}
        <ExposureTable rows={model.exposureRows} />
      </CardContent>
    </Card>
  )
}

function ExposureTable({ rows }: { rows: RiskExposureRow[] }) {
  return (
    <div className="overflow-hidden">
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
          rows.slice(0, 24).map((row) => <ExposureRow key={row.id} row={row} />)
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
          {row.assetSymbol} · {row.settlementLabel}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase">
          {row.oracleId.slice(0, 8)}...{row.oracleId.slice(-4)}
        </div>
      </div>
      <div className="font-mono text-[10px] text-primary uppercase">
        {row.kind === "directional" ? "DIR" : "RNG"}
      </div>
      <LabeledExposureValue
        label="Open qty"
        value={row.openQuantity.toLocaleString("en-US", {
          maximumFractionDigits: 4,
        })}
      />
      <LabeledExposureValue label="Cost" value={formatUsd(row.costBasisUsd)} />
      <LabeledExposureValue
        label="Max payout"
        value={formatUsd(row.maxPayoutUsd)}
      />
      <LabeledExposureValue
        label="Est. payout"
        value={formatUsd(row.payoutEstimateUsd)}
      />
      <div className="font-mono text-muted-foreground tabular-nums lg:text-right">
        {formatExpiryDate(row.expiryMs)}
      </div>
    </div>
  )
}

function LabeledExposureValue({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 font-mono text-foreground tabular-nums lg:block lg:text-right">
      <span className="text-muted-foreground lg:hidden">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function AssumptionsCard({ assumptions }: { assumptions: string[] }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">Assumptions</CardTitle>
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
