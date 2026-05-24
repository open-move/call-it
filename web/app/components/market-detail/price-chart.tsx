import { type MarketPricePoint } from "~/lib/callit/types"
import { cn } from "~/lib/utils"

export interface PriceChartProps {
  className?: string
  points: MarketPricePoint[]
  trend: "up" | "down"
}

function getChartCoordinates(points: MarketPricePoint[]) {
  const values = points.map((point) => point.valueUsd)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const lastIndex = Math.max(points.length - 1, 1)

  return points.map((point, index) => ({
    x: (index / lastIndex) * 100,
    y: 44 - ((point.valueUsd - min) / range) * 36,
  }))
}

export function PriceChart({ className, points, trend }: PriceChartProps) {
  if (points.length === 0) {
    return null
  }

  const coordinates = getChartCoordinates(points)
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ")
  const areaPath = `${linePath} L 100 48 L 0 48 Z`
  const firstLabel = points[0]?.label
  const lastLabel = points.at(-1)?.label

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative h-56 overflow-hidden rounded-md bg-surface sm:h-72">
        <svg
          aria-label="Price history chart"
          className={cn(
            "h-full w-full",
            trend === "up" ? "text-chart-price-up" : "text-chart-price-down"
          )}
          preserveAspectRatio="none"
          role="img"
          viewBox="0 0 100 48"
        >
          <defs>
            <linearGradient id="price-chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#price-chart-fill)" />
          <path
            d={linePath}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground uppercase">
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  )
}
