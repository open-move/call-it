import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import {
  type AreaData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts"

import { Card } from "~/components/ui/card"
import { formatUsd } from "~/lib/callit/format"
import { type MarketPricePoint } from "~/lib/callit/market/types"

export interface ChartPanelProps {
  assetName: string
  assetSymbol: string
  oracleId: string
  points: MarketPricePoint[]
  selectedStrikePriceUsd: number
}

interface ElementSize {
  height: number
  width: number
}

interface PriceSummary {
  count: number
  max: number
  min: number
}

interface LightweightPriceChartProps {
  containerRef: RefObject<HTMLDivElement | null>
  selectedStrikePriceUsd: number
  seriesData: AreaData[]
  size: ElementSize
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

function getElementSize(element: HTMLElement): ElementSize {
  const rect = element.getBoundingClientRect()

  return {
    height: Math.floor(rect.height),
    width: Math.floor(rect.width),
  }
}

function getPriceSummary(points: MarketPricePoint[]): PriceSummary | undefined {
  if (points.length === 0) {
    return undefined
  }

  const values = points.map((point) => point.valueUsd)

  return {
    count: points.length,
    max: Math.max(...values),
    min: Math.min(...values),
  }
}

function isSameSize(firstSize: ElementSize, secondSize: ElementSize) {
  return (
    firstSize.height === secondSize.height &&
    firstSize.width === secondSize.width
  )
}

function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ height: 0, width: 0 })

  useEffect(() => {
    const element = ref.current

    if (!element) {
      return
    }

    function updateSize(nextSize: ElementSize) {
      setSize((currentSize) =>
        isSameSize(currentSize, nextSize) ? currentSize : nextSize
      )
    }

    updateSize(getElementSize(element))

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) {
        return
      }

      updateSize({
        height: Math.floor(entry.contentRect.height),
        width: Math.floor(entry.contentRect.width),
      })
    })

    resizeObserver.observe(element)

    return () => resizeObserver.disconnect()
  }, [ref])

  return size
}

function formatPriceSummary(summary: PriceSummary) {
  return `${summary.count} pts · ${formatUsd(summary.min, 0)}-${formatUsd(summary.max, 0)}`
}

export function ChartPanel({
  points,
  selectedStrikePriceUsd,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const seriesData = useMemo(() => toAreaData(points), [points])
  const size = useElementSize(containerRef)
  const priceSummary = getPriceSummary(points)

  useEffect(() => {
    console.log("points", points)
  }, [points])

  return (
    <Card className="relative min-h-[30rem] w-full flex-1 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <div className="absolute inset-0 bg-card" ref={containerRef} />
      {seriesData.length > 0 ? (
        <LightweightPriceChart
          containerRef={containerRef}
          selectedStrikePriceUsd={selectedStrikePriceUsd}
          seriesData={seriesData}
          size={size}
        />
      ) : null}
      {priceSummary ? (
        <div className="pointer-events-none absolute top-3 left-4 z-10 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {formatPriceSummary(priceSummary)} · {size.width}x{size.height}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No oracle price history is available for this market yet.
        </div>
      )}
    </Card>
  )
}

function LightweightPriceChart({
  containerRef,
  selectedStrikePriceUsd,
  seriesData,
  size,
}: LightweightPriceChartProps) {
  const chartRef = useRef<IChartApi | null>(null)
  const priceLineRef = useRef<IPriceLine | null>(null)
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null)
  const canMount = seriesData.length > 0 && size.height > 0 && size.width > 0

  useEffect(() => {
    const container = containerRef.current

    if (!canMount || !container || chartRef.current) {
      return
    }

    let cleanupChart: (() => void) | undefined
    let isDisposed = false

    async function mountChart(chartContainer: HTMLDivElement) {
      const { AreaSeries, ColorType, LineStyle, createChart } =
        await import("lightweight-charts")

      if (isDisposed) {
        return
      }

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
        height: size.height,
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
        width: size.width,
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
      priceLineRef.current = series.createPriceLine({
        axisLabelVisible: true,
        color: "rgba(91, 141, 239, 0.9)",
        lineStyle: LineStyle.Dashed,
        lineVisible: true,
        lineWidth: 1,
        price: selectedStrikePriceUsd,
        title: "Strike",
      })
      chart.timeScale().fitContent()

      chartRef.current = chart
      seriesRef.current = series
      cleanupChart = () => chart.remove()
    }

    void mountChart(container)

    return () => {
      isDisposed = true
      cleanupChart?.()
      chartRef.current = null
      priceLineRef.current = null
      seriesRef.current = null
    }
  }, [canMount, containerRef])

  useEffect(() => {
    if (chartRef.current && size.height > 0 && size.width > 0) {
      chartRef.current.applyOptions({ height: size.height, width: size.width })
    }
  }, [size.height, size.width])

  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setData(seriesData)
      chartRef.current?.timeScale().fitContent()
    }
  }, [seriesData])

  useEffect(() => {
    priceLineRef.current?.applyOptions({ price: selectedStrikePriceUsd })
  }, [selectedStrikePriceUsd])

  return null
}
