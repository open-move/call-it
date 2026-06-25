import type { PerformancePoint } from "@/lib/perf/annualize"

export function getMedian(values: number[]) {
  const sortedValues = [...values].sort((first, second) => first - second)
  const midpoint = Math.floor(sortedValues.length / 2)

  return sortedValues.length % 2 === 0
    ? (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2
    : sortedValues[midpoint]
}

export function getDisplayChartPoints<TPoint extends PerformancePoint>(points: TPoint[]) {
  if (points.length < 8) {
    return { filteredCount: 0, points }
  }

  const median = getMedian(points.map((point) => point.share_price))
  const lowerBound = median * 0.9
  const upperBound = median * 1.1
  const displayPoints = points.filter(
    (point) =>
      point.share_price >= lowerBound && point.share_price <= upperBound
  )

  if (displayPoints.length < Math.max(5, points.length * 0.5)) {
    return { filteredCount: 0, points }
  }

  return {
    filteredCount: points.length - displayPoints.length,
    points: displayPoints,
  }
}

export function getChartDomain(points: PerformancePoint[]) {
  if (points.length === 0) {
    return undefined
  }

  const values = points.map((point) => point.share_price)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.08, 0.00005)

  return [min - padding, max + padding] satisfies [number, number]
}
