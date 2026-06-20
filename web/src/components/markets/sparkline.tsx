import { useId } from "react"

import type { MarketPricePoint } from "@/lib/types/market"
import { cn } from "@/lib/utils"

export interface SparklineProps {
  className?: string
  points: MarketPricePoint[]
}

const VIEWBOX_WIDTH = 132
const VIEWBOX_HEIGHT = 44
const PADDING = 3

function getPath(points: MarketPricePoint[]) {
  if (points.length < 2) {
    return undefined
  }

  const values = points.map((point) => point.valueUsd)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valueRange = maxValue - minValue || 1
  const xStep = (VIEWBOX_WIDTH - PADDING * 2) / (points.length - 1)
  const pathPoints = points.map((point, index) => {
    const x = PADDING + index * xStep
    const normalizedY = (point.valueUsd - minValue) / valueRange
    const y =
      VIEWBOX_HEIGHT - PADDING - normalizedY * (VIEWBOX_HEIGHT - PADDING * 2)

    return { x, y }
  })

  return pathPoints
    .map(
      ({ x, y }, index) =>
        `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`
    )
    .join(" ")
}

function getAreaPath(linePath: string) {
  return `${linePath} L${VIEWBOX_WIDTH - PADDING} ${VIEWBOX_HEIGHT - PADDING} L${PADDING} ${VIEWBOX_HEIGHT - PADDING} Z`
}

function getTone(points: MarketPricePoint[]) {
  const firstPoint = points[0]
  const lastPoint = points.at(-1)

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!firstPoint || !lastPoint) {
    return "neutral"
  }

  return lastPoint.valueUsd >= firstPoint.valueUsd ? "up" : "down"
}

export function Sparkline({ className, points }: SparklineProps) {
  const gradientId = useId()
  const path = getPath(points)
  const tone = getTone(points)
  const isUp = tone !== "down"
  const strokeClassName = isUp ? "stroke-outcome-up" : "stroke-outcome-down"
  const fillColor = isUp ? "var(--outcome-up)" : "var(--outcome-down)"

  if (!path) {
    return (
      <div
        className={cn(
          "flex h-8 items-center justify-center rounded-md bg-muted/25 text-[10px] font-medium text-muted-foreground",
          className
        )}
      >
        No chart
      </div>
    )
  }

  return (
    <svg
      aria-hidden="true"
      className={cn("h-8 w-full overflow-visible", className)}
      focusable="false"
      preserveAspectRatio="none"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fillColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={getAreaPath(path)} fill={`url(#${gradientId})`} />
      <path
        className={strokeClassName}
        d={path}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
