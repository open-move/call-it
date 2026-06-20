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

import { Button } from "@/components/ui/button"
import {
  chartMetrics,
  formatChartTick,
} from "@/lib/risk/helpers"
import type { ChartMetric } from "@/lib/risk/helpers"
import type { RiskScenarioRow } from "@/lib/risk/types"
import { cn } from "@/lib/utils"

export function ScenarioChartPanel({
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
