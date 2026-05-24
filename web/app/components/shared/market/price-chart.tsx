import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart"
import { formatUsd } from "~/lib/callit/format"
import { type MarketPricePoint } from "~/lib/callit/market/types"
import { cn } from "~/lib/utils"

export interface PriceChartProps {
  className?: string
  points: MarketPricePoint[]
  strikePriceUsd: number
  trend: "up" | "down"
}

const shortTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  timeZone: "UTC",
})

const fullTimeFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  second: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
})

const axisTick = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
} as const

function formatShortTime(timestampMs: number) {
  return shortTimeFormatter.format(new Date(timestampMs))
}

function formatFullTime(timestampMs: number) {
  return fullTimeFormatter.format(new Date(timestampMs))
}

function getYDomain(points: MarketPricePoint[], strikePriceUsd: number) {
  const values = points.map((point) => point.valueUsd)
  const min = Math.min(strikePriceUsd, ...values)
  const max = Math.max(strikePriceUsd, ...values)
  const range = max - min
  const padding = Math.max(range * 0.08, Math.abs(max) * 0.0005, 1)

  return [min - padding, max + padding] satisfies [number, number]
}

export function PriceChart({
  className,
  points,
  strikePriceUsd,
  trend,
}: PriceChartProps) {
  if (points.length === 0) {
    return null
  }

  const lineColor =
    trend === "up" ? "var(--chart-price-up)" : "var(--chart-price-down)"
  const chartConfig = {
    valueUsd: {
      color: lineColor,
      label: "Spot",
    },
  } satisfies ChartConfig
  const yDomain = getYDomain(points, strikePriceUsd)

  return (
    <div className={cn(className)}>
      <div className="rounded-md">
        <ChartContainer
          className="aspect-auto h-56 w-full sm:h-72 [&_.recharts-cartesian-axis-tick_text]:font-mono"
          config={chartConfig}
        >
          <LineChart
            accessibilityLayer
            data={points}
            margin={{ bottom: 0, left: 4, right: 12, top: 18 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="timestampMs"
              domain={["dataMin", "dataMax"]}
              minTickGap={28}
              scale="time"
              tick={axisTick}
              tickFormatter={formatShortTime}
              tickLine={false}
              tickMargin={10}
              type="number"
            />
            <YAxis
              axisLine={false}
              domain={yDomain}
              tick={axisTick}
              tickFormatter={(value) => formatUsd(value, 0)}
              tickLine={false}
              tickMargin={10}
              width={64}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    typeof value === "number"
                      ? formatUsd(value, 2)
                      : String(value)
                  }
                  labelFormatter={(_, payload) => {
                    const timestampMs = payload[0]?.payload?.timestampMs

                    return typeof timestampMs === "number"
                      ? formatFullTime(timestampMs)
                      : "Price"
                  }}
                />
              }
            />
            <ReferenceLine
              label={{
                fill: "var(--muted-foreground)",
                fontSize: 11,
                position: "insideTopRight",
                value: "Strike",
              }}
              stroke="var(--chart-4)"
              strokeDasharray="4 4"
              y={strikePriceUsd}
            />
            <Line
              dataKey="valueUsd"
              dot={false}
              isAnimationActive={false}
              name="Spot"
              stroke="var(--color-valueUsd)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              type="monotone"
            />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  )
}
