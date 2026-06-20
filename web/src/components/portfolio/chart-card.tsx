import { useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DusdcValue,
  SignedDusdcValue,
  formatPercent,
  formatPnlAxisTick,
  formatSignedDusdc,
} from "@/lib/portfolio/format"
import {
  type ChartInterval,
  type ChartMode,
  type PortfolioSummary,
  type RealizedPnlPoint,
  type ExposureTone,
  chartIntervals,
  axisTick,
  getDisplayRealizedPnlPoints,
  getExposureBgClassName,
  getExposureTextClassName,
  getIntervalRealizedPnlPoints,
  getPnlClassName,
  getRealizedPnlDomain,
  getRealizedPnlTicks,
  fullDateFormatter,
  shortDateFormatter,
} from "@/lib/portfolio/helpers"
import { cn } from "@/lib/utils"

function SkeletonPanel() {
  return (
    <div className="grid w-full max-w-2xl gap-4">
      <div className="h-7 w-32 rounded-md bg-muted" />
      <div className="mt-8 h-2 rounded-full bg-muted" />
      <div className="h-2 w-3/4 rounded-full bg-muted" />
      <div className="h-2 w-1/2 rounded-full bg-muted" />
    </div>
  )
}

function ExposureTile({
  segment,
  total,
}: {
  segment: { label: string; tone: ExposureTone; value: number }
  total: number
}) {
  const percent = total > 0 ? segment.value / total : 0

  return (
    <div className="min-w-0 overflow-hidden rounded-md bg-muted/25 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "text-xs font-medium",
            getExposureTextClassName(segment.tone)
          )}
        >
          {segment.label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
          {formatPercent(percent)}
        </span>
      </div>
      <DusdcValue
        className="mt-2 text-sm font-medium text-foreground"
        value={segment.value}
      />
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-background/45">
        <div
          className={cn(
            "h-full rounded-full",
            getExposureBgClassName(segment.tone)
          )}
          style={{
            width: `${Math.max(percent * 100, segment.value > 0 ? 4 : 0)}%`,
          }}
        />
      </div>
    </div>
  )
}

function ExposurePanel({ summary }: { summary: PortfolioSummary }) {
  const total = summary.openCostBasisUsd
  const segments = [
    { label: "Up", tone: "up" as const, value: summary.upCostBasisUsd },
    { label: "Down", tone: "down" as const, value: summary.downCostBasisUsd },
    { label: "Range", tone: "range" as const, value: summary.rangeCostBasisUsd },
  ]

  if (total <= 0) {
    return (
      <div className="grid w-full max-w-2xl place-items-center gap-2 text-center">
        <DusdcValue className="text-2xl text-muted-foreground" value={0} />
        <div className="text-sm font-medium text-foreground">
          No open exposure
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">
          Open positions will appear here once DUSDC is deployed.
        </p>
      </div>
    )
  }

  return (
    <div className="grid w-full max-w-3xl gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Open Cost Basis</div>
          <DusdcValue
            className="mt-1 text-xl font-medium text-foreground"
            value={total}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Current allocation across open Predict positions
        </div>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-muted/45">
        {segments.map((segment) => {
          const percent = segment.value / total

          return segment.value > 0 ? (
            <div
              className={cn("h-full", getExposureBgClassName(segment.tone))}
              key={segment.label}
              style={{ flexBasis: `${percent * 100}%` }}
            />
          ) : null
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {segments.map((segment) => (
          <ExposureTile key={segment.label} segment={segment} total={total} />
        ))}
      </div>
    </div>
  )
}

export function PortfolioChartCard({
  isLoading,
  realizedPnlPoints,
  summary,
}: {
  isLoading: boolean
  realizedPnlPoints: RealizedPnlPoint[]
  summary: PortfolioSummary
}) {
  const [chartMode, setChartMode] = useState<ChartMode>("realized")
  const [chartInterval, setChartInterval] = useState<ChartInterval>("max")
  const visibleRealizedPnlPoints = getIntervalRealizedPnlPoints(
    realizedPnlPoints,
    chartInterval
  )
  const visibleRealizedPnl =
    visibleRealizedPnlPoints.at(-1)?.cumulativePnlUsd ?? 0
  const chartConfig = {
    cumulativePnlUsd: {
      color:
        visibleRealizedPnl >= 0 ? "var(--outcome-up)" : "var(--outcome-down)",
      label: "Realized P&L",
    },
  } satisfies ChartConfig
  const chartPoints = getDisplayRealizedPnlPoints(visibleRealizedPnlPoints)
  const yDomain = getRealizedPnlDomain(chartPoints)
  const yTicks = getRealizedPnlTicks(yDomain)

  return (
    <Card className="min-h-[17rem] gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <div className="flex items-center justify-between gap-3 border-b border-border/45 px-4 py-3">
        <Tabs
          className="min-w-0 gap-0"
          value={chartMode}
          onValueChange={(value) => setChartMode(value as ChartMode)}
        >
          <TabsList
            className="h-full w-full justify-start gap-5 overflow-x-auto rounded-none p-0"
            variant="line"
          >
            <TabsTrigger
              className="flex-none rounded-none px-0 text-xs font-medium tracking-[-0.01em] text-muted-foreground transition-[color] duration-150 after:bg-primary hover:text-foreground data-active:text-foreground"
              value="realized"
            >
              Realized PnL
            </TabsTrigger>
            <TabsTrigger
              className="flex-none rounded-none px-0 text-xs font-medium tracking-[-0.01em] text-muted-foreground transition-[color] duration-150 after:bg-primary hover:text-foreground data-active:text-foreground"
              value="exposure"
            >
              Exposure
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {chartMode === "realized" ? (
          <div className="hidden items-center gap-1 sm:flex">
            {chartIntervals.map((interval) => (
              <Button
                className="h-7 px-2.5 font-mono text-[11px] text-muted-foreground data-[active=true]:text-foreground"
                data-active={chartInterval === interval.value}
                key={interval.value}
                size="xs"
                type="button"
                variant={
                  chartInterval === interval.value ? "secondary" : "ghost"
                }
                onClick={() => setChartInterval(interval.value)}
              >
                {interval.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-52 place-items-center px-4 py-3">
        {isLoading ? (
          <SkeletonPanel />
        ) : chartMode === "exposure" ? (
          <ExposurePanel summary={summary} />
        ) : visibleRealizedPnlPoints.length === 0 ? (
          <div className="text-center">
            <DusdcValue className="text-2xl text-muted-foreground" value={0} />
            <p className="mt-10 text-sm text-muted-foreground">
              No realized P&L yet. Close or redeem a position to start the
              chart.
            </p>
          </div>
        ) : (
          <div className="h-52 w-full">
            <div
              className={cn(
                "mb-2 text-xl font-medium",
                getPnlClassName(visibleRealizedPnl)
              )}
            >
              <SignedDusdcValue value={visibleRealizedPnl} />
            </div>
            <ChartContainer
              className="h-40 w-full [&_.recharts-cartesian-axis-tick_text]:font-mono"
              config={chartConfig}
            >
              <AreaChart
                accessibilityLayer
                baseValue={yDomain[0]}
                data={chartPoints}
                margin={{ bottom: 0, left: 4, right: 12, top: 10 }}
              >
                <defs>
                  <linearGradient
                    id="realizedPnlGradient"
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-cumulativePnlUsd)"
                      stopOpacity={0.18}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-cumulativePnlUsd)"
                      stopOpacity={0.03}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="timestampMs"
                  domain={["dataMin", "dataMax"]}
                  minTickGap={28}
                  scale="time"
                  tick={axisTick}
                  tickFormatter={(value) =>
                    typeof value === "number"
                      ? shortDateFormatter.format(value)
                      : ""
                  }
                  tickLine={false}
                  tickMargin={10}
                  type="number"
                />
                <YAxis
                  axisLine={false}
                  domain={yDomain}
                  tick={axisTick}
                  ticks={yTicks}
                  tickFormatter={(value) =>
                    typeof value === "number" ? formatPnlAxisTick(value) : ""
                  }
                  tickLine={false}
                  tickMargin={10}
                  width={82}
                />
                <ReferenceLine
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.35}
                  y={0}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        typeof value === "number"
                          ? formatSignedDusdc(value)
                          : String(value)
                      }
                      labelFormatter={(_, payload) => {
                        const point = payload[0]?.payload as
                          | RealizedPnlPoint
                          | undefined

                        if (!point) {
                          return "Realized P&L"
                        }

                        return `${point.contractLabel} · ${fullDateFormatter.format(point.timestampMs)}`
                      }}
                    />
                  }
                />
                <Area
                  dataKey="cumulativePnlUsd"
                  fill="url(#realizedPnlGradient)"
                  fillOpacity={1}
                  isAnimationActive={false}
                  name="Realized P&L"
                  stroke="var(--color-cumulativePnlUsd)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ChartContainer>
          </div>
        )}
      </div>
    </Card>
  )
}
