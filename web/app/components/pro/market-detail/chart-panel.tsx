import { useEffect, useMemo, useRef } from "react"
import { type AreaData, type UTCTimestamp } from "lightweight-charts"

import { Card } from "~/components/ui/card"
import { type MarketPricePoint } from "~/lib/callit/market/types"

export interface ChartPanelProps {
  assetName: string
  assetSymbol: string
  oracleId: string
  points: MarketPricePoint[]
  selectedStrikePriceUsd: number
}

function toAreaData(points: MarketPricePoint[]): AreaData[] {
  const pointsBySecond = new Map<number, number>()

  points
    .slice()
    .sort(
      (firstPoint, secondPoint) =>
        firstPoint.timestampMs - secondPoint.timestampMs
    )
    .forEach((point) => {
      pointsBySecond.set(Math.floor(point.timestampMs / 1_000), point.valueUsd)
    })

  return Array.from(pointsBySecond.entries()).map(([timestamp, value]) => ({
    time: timestamp as UTCTimestamp,
    value,
  }))
}

export function ChartPanel({
  points,
  selectedStrikePriceUsd,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const seriesData = useMemo(() => toAreaData(points), [points])

  useEffect(() => {
    const container = containerRef.current

    if (!container || seriesData.length === 0) {
      return
    }

    let isDisposed = false
    let resizeObserver: ResizeObserver | undefined

    async function mountChart(chartContainer: HTMLDivElement) {
      const { AreaSeries, ColorType, LineStyle, createChart } =
        await import("lightweight-charts")

      if (isDisposed) {
        return
      }

      const initialWidth = Math.max(chartContainer.clientWidth, 1)
      const initialHeight = Math.max(chartContainer.clientHeight, 1)
      const computedBackgroundColor =
        getComputedStyle(chartContainer).backgroundColor
      const chartBackgroundColor =
        computedBackgroundColor === "rgba(0, 0, 0, 0)"
          ? "transparent"
          : computedBackgroundColor
      const chart = createChart(chartContainer, {
        autoSize: false,
        crosshair: {
          horzLine: {
            color: "rgba(148, 163, 184, 0.22)",
            labelBackgroundColor: "#1e293b",
          },
          vertLine: {
            color: "rgba(148, 163, 184, 0.18)",
            labelBackgroundColor: "#1e293b",
          },
        },
        grid: {
          horzLines: { color: "rgba(148, 163, 184, 0.08)" },
          vertLines: { color: "rgba(148, 163, 184, 0.05)" },
        },
        height: initialHeight,
        layout: {
          attributionLogo: false,
          background: { color: chartBackgroundColor, type: ColorType.Solid },
          fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif",
          textColor: "#94a3b8",
        },
        localization: {
          priceFormatter: (price: number) =>
            price.toLocaleString("en-US", {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            }),
        },
        rightPriceScale: {
          borderColor: "rgba(148, 163, 184, 0.12)",
        },
        timeScale: {
          borderColor: "rgba(148, 163, 184, 0.12)",
          rightOffset: 4,
          timeVisible: true,
        },
        width: initialWidth,
      })
      const series = chart.addSeries(AreaSeries, {
        bottomColor: "rgba(85, 198, 211, 0)",
        lineColor: "#55c6d3",
        lineWidth: 2,
        priceFormat: {
          minMove: 0.01,
          precision: 2,
          type: "price",
        },
        topColor: "rgba(85, 198, 211, 0.22)",
      })

      series.setData(seriesData)
      series.createPriceLine({
        axisLabelVisible: true,
        color: "rgba(91, 141, 239, 0.9)",
        lineStyle: LineStyle.Dashed,
        lineVisible: true,
        lineWidth: 1,
        price: selectedStrikePriceUsd,
        title: "Strike",
      })
      chart.timeScale().fitContent()

      resizeObserver = new ResizeObserver(() => {
        const width = chartContainer.clientWidth
        const height = chartContainer.clientHeight

        if (width > 0 && height > 0) {
          chart.applyOptions({ height, width })
        }
      })
      resizeObserver.observe(chartContainer)

      return () => chart.remove()
    }

    let cleanupChart: (() => void) | undefined

    mountChart(container).then((cleanup) => {
      cleanupChart = cleanup
    })

    return () => {
      isDisposed = true
      resizeObserver?.disconnect()
      cleanupChart?.()
    }
  }, [seriesData, selectedStrikePriceUsd])

  return (
    <Card className="relative flex min-h-[30rem] flex-1 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <div className="min-h-[30rem] flex-1 bg-card" ref={containerRef} />
      {seriesData.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No oracle price history is available for this market yet.
        </div>
      ) : null}
    </Card>
  )
}
