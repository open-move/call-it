import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

import { getChartDomain, getDisplayChartPoints } from "@/lib/earn/chart"
import { dateFormatter } from "@/lib/earn/format"
import type { PerformancePoint } from "@/lib/perf/annualize"

interface SharePriceChartProps<TPoint extends PerformancePoint> {
  currentPrice: string
  gradientId: string
  points: TPoint[]
  title: string
}

export function SharePriceChart<TPoint extends PerformancePoint>({
  currentPrice,
  gradientId,
  points,
  title,
}: SharePriceChartProps<TPoint>) {
  const chartData = getDisplayChartPoints(points)
  const yDomain = getChartDomain(chartData.points)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="text-xs leading-none text-muted-foreground">
          {title}
        </div>
        <div className="font-mono text-xs font-medium text-foreground tabular-nums">
          {currentPrice}
        </div>
      </div>
      <div className="h-44 sm:h-56">
        {chartData.points.length > 0 && yDomain ? (
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart
              data={chartData.points}
              margin={{ bottom: 0, left: 0, right: 10, top: 8 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--primary)"
                    stopOpacity={0.24}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--primary)"
                    stopOpacity={0}
                  />
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
                dataKey="timestamp_ms"
                domain={["dataMin", "dataMax"]}
                minTickGap={34}
                scale="time"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(value) => dateFormatter.format(new Date(value))}
                tickLine={false}
                type="number"
              />
              <YAxis
                axisLine={false}
                domain={yDomain}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(value) => Number(value).toFixed(4)}
                tickLine={false}
                width={52}
              />
              <Area
                dataKey="share_price"
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                stroke="var(--primary)"
                strokeWidth={2.25}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            No performance history yet.
          </div>
        )}
      </div>
    </div>
  )
}
