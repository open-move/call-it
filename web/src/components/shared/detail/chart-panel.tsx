import { useEffect, useMemo, useRef, useState } from "react"
import type {
  CandlestickData,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts"
import type { RefObject } from "react"

import { formatUsd } from "@/lib/format"
import type { MarketPricePoint } from "@/lib/types/market"

export interface ChartPanelProps {
  points: MarketPricePoint[]
  referenceLabel: string
  referencePriceUsd: number
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
  referenceLabel: string
  referencePriceUsd: number
  seriesData: CandlestickData[]
  size: ElementSize
}

const FALLBACK_CANDLE_DOWN_COLOR = "#ef6a5a"
const FALLBACK_CANDLE_UP_COLOR = "#7fd36b"
const FALLBACK_REFERENCE_COLOR = "#5b8def"
const AXIS_FONT_SIZE = 11
const RIGHT_CANDLE_OFFSET = 6
const VISIBLE_CANDLE_COUNT = 90

function sortPricePoints(points: MarketPricePoint[]) {
  return points
    .slice()
    .sort(
      (firstPoint, secondPoint) =>
        firstPoint.timestampMs - secondPoint.timestampMs
    )
}

function toCandlestickData(points: MarketPricePoint[]): CandlestickData[] {
  const sortedPoints = sortPricePoints(points)
  const pointsBySecond = new Map<number, number>()

  sortedPoints.forEach((point) => {
    pointsBySecond.set(Math.floor(point.timestampMs / 1_000), point.valueUsd)
  })

  const dedupedPoints = Array.from(pointsBySecond.entries()).map(
    ([timestamp, value]) => ({
      timestamp,
      value,
    })
  )

  return dedupedPoints.map((point, index) => {
    const previousPoint = dedupedPoints[index - 1]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const open = previousPoint?.value ?? point.value
    const close = point.value

    return {
      close,
      high: Math.max(open, close),
      low: Math.min(open, close),
      open,
      time: point.timestamp as UTCTimestamp,
    }
  })
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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

function isChartSupportedColor(value: string) {
  return (
    value.startsWith("#") ||
    value.startsWith("rgb(") ||
    value.startsWith("rgba(") ||
    /^[a-z]+$/i.test(value)
  )
}

function getChartColor(token: string, fallback: string) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim()

  return value && isChartSupportedColor(value) ? value : fallback
}

function applyDefaultVisibleRange(chart: IChartApi, candleCount: number) {
  const rightEdge = candleCount - 1 + RIGHT_CANDLE_OFFSET
  const leftEdge = rightEdge - VISIBLE_CANDLE_COUNT

  chart.timeScale().setVisibleLogicalRange({
    from: leftEdge,
    to: rightEdge,
  })
}

export function ChartPanel({
  points,
  referenceLabel,
  referencePriceUsd,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const seriesData = useMemo(() => toCandlestickData(points), [points])
  const size = useElementSize(containerRef)
  const priceSummary = getPriceSummary(points)

  return (
    <div className="relative min-h-0 w-full flex-1">
      <div className="absolute inset-0" ref={containerRef} />
      {seriesData.length > 0 ? (
        <LightweightPriceChart
          containerRef={containerRef}
          referenceLabel={referenceLabel}
          referencePriceUsd={referencePriceUsd}
          seriesData={seriesData}
          size={size}
        />
      ) : null}
      {priceSummary ? (
        <div className="pointer-events-none absolute top-3 left-4 z-10 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {formatPriceSummary(priceSummary)}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No price history yet.
        </div>
      )}
    </div>
  )
}

function LightweightPriceChart({
  containerRef,
  referenceLabel,
  referencePriceUsd,
  seriesData,
  size,
}: LightweightPriceChartProps) {
  const chartRef = useRef<IChartApi | null>(null)
  const priceLineRef = useRef<IPriceLine | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const canMount = seriesData.length > 0 && size.height > 0 && size.width > 0

  useEffect(() => {
    const container = containerRef.current

    if (!canMount || !container || chartRef.current) {
      return
    }

    let cleanupChart: (() => void) | undefined
    let isDisposed = false

    async function mountChart(chartContainer: HTMLDivElement) {
      const { CandlestickSeries, ColorType, LineStyle, createChart } =
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
      const candleUpColor = getChartColor(
        "--outcome-up",
        FALLBACK_CANDLE_UP_COLOR
      )
      const candleDownColor = getChartColor(
        "--outcome-down",
        FALLBACK_CANDLE_DOWN_COLOR
      )
      const referenceColor = getChartColor("--primary", FALLBACK_REFERENCE_COLOR)
      const popoverColor = getChartColor("--popover", "#1e293b")
      const mutedForegroundColor = getChartColor("--muted-foreground", "#94a3b8")
      const chart = createChart(chartContainer, {
        autoSize: false,
        crosshair: {
          horzLine: {
            color: "rgba(148, 163, 184, 0.22)",
            labelBackgroundColor: popoverColor,
          },
          vertLine: {
            color: "rgba(148, 163, 184, 0.18)",
            labelBackgroundColor: popoverColor,
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
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: AXIS_FONT_SIZE,
          textColor: mutedForegroundColor,
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
          minimumWidth: 72,
        },
        timeScale: {
          barSpacing: 7,
          borderColor: "rgba(148, 163, 184, 0.12)",
          rightOffset: 4,
          timeVisible: true,
        },
        width: size.width,
      })
      const series = chart.addSeries(CandlestickSeries, {
        borderDownColor: candleDownColor,
        borderUpColor: candleUpColor,
        downColor: candleDownColor,
        priceFormat: {
          minMove: 0.01,
          precision: 2,
          type: "price",
        },
        upColor: candleUpColor,
        wickDownColor: candleDownColor,
        wickUpColor: candleUpColor,
      })

      series.setData(seriesData)
      priceLineRef.current = series.createPriceLine({
        axisLabelVisible: true,
        color: referenceColor,
        lineStyle: LineStyle.Dashed,
        lineVisible: true,
        lineWidth: 1,
        price: referencePriceUsd,
        title: referenceLabel,
      })
      applyDefaultVisibleRange(chart, seriesData.length)

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
  }, [canMount, containerRef, referenceLabel, referencePriceUsd, seriesData])

  useEffect(() => {
    if (chartRef.current && size.height > 0 && size.width > 0) {
      chartRef.current.applyOptions({ height: size.height, width: size.width })
    }
  }, [size.height, size.width])

  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setData(seriesData)
      if (chartRef.current) {
        applyDefaultVisibleRange(chartRef.current, seriesData.length)
      }
    }
  }, [seriesData])

  useEffect(() => {
    priceLineRef.current?.applyOptions({ price: referencePriceUsd })
  }, [referencePriceUsd])

  return null
}
