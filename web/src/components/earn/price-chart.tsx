import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

import { getDisplayChartPoints, getChartDomain } from "@/lib/earn/chart"
import { dateFormatter, formatSharePrice } from "@/lib/earn/format"
import type { VaultPerformanceResponse, VaultSummary } from "@/lib/types/predict"

export function VaultPriceChart({
  performance,
  summary,
}: {
  performance: VaultPerformanceResponse
  summary: VaultSummary
}) {
  const chartData = getDisplayChartPoints(performance.points)
  const yDomain = getChartDomain(chartData.points)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="text-xs leading-none text-muted-foreground">
          PLP Price
        </div>
        <div className="font-mono text-xs font-medium text-foreground tabular-nums">
          ${formatSharePrice(summary.plp_share_price)}
        </div>
      </div>
      <div className="h-28 sm:h-32">
        {chartData.points.length > 0 && yDomain ? (
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart
              data={chartData.points}
              margin={{ bottom: 0, left: 0, right: 10, top: 8 }}
            >
              <defs>
                <linearGradient
                  id="plpShareGradient"
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
                fill="url(#plpShareGradient)"
                isAnimationActive={false}
                stroke="var(--primary)"
                strokeWidth={2.25}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            No vault performance history is available yet.
          </div>
        )}
      </div>
    </div>
  )
}
