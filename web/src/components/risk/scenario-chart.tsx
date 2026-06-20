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
import { chartMetrics, formatChartTick } from "@/lib/risk/helpers"
import type { ChartMetric } from "@/lib/risk/helpers"
import type { RiskScenarioId, RiskScenarioRow } from "@/lib/risk/types"
import { cn } from "@/lib/utils"

type ChartRow = RiskScenarioRow & { chartValue: number }

export function ScenarioChartPanel({
  metric,
  onMetricChange,
  onScenarioChange,
  rows,
  selectedScenario,
}: {
  metric: ChartMetric
  onMetricChange: (metric: ChartMetric) => void
  onScenarioChange: (scenarioId: RiskScenarioId) => void
  rows: ChartRow[]
  selectedScenario: RiskScenarioRow
}) {
  const sortedRows = [...rows].sort(
    (first, second) => first.drawdownPct - second.drawdownPct
  )

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          Shock curve · click a point to inspect
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

      <div className="mt-3 h-64 sm:h-72">
        <ResponsiveContainer
          height="100%"
          initialDimension={{ height: 288, width: 720 }}
          width="100%"
        >
          <AreaChart
            className="cursor-pointer"
            data={sortedRows}
            margin={{ bottom: 0, left: 0, right: 12, top: 10 }}
            onClick={(state) => {
              const row = sortedRows.find(
                (candidate) => candidate.label === state.activeLabel
              )

              if (row) {
                onScenarioChange(row.id)
              }
            }}
          >
            <defs>
              <linearGradient id="riskMetricGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.24} />
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
              activeDot={{ r: 4 }}
              dataKey="chartValue"
              dot={{ r: 2 }}
              isAnimationActive={false}
              stroke="var(--primary)"
              strokeWidth={2.25}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
