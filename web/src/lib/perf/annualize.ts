export interface PerformancePoint {
  share_price: number
  timestamp_ms: number
}

export interface AnnualizedReturn {
  apr: number
  apy: number
  periodReturn: number
  windowDays: number
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// Below this much history, annualizing a share-price move is meaningless — a
// few days of a volatile vault extrapolated to a year explodes into thousands
// of percent — so callers show the realized period return instead.
export const MIN_ANNUALIZE_DAYS = 7

export function annualizedReturn(
  points: PerformancePoint[],
  windowMs = 30 * DAY_MS
): AnnualizedReturn | null {
  if (points.length < 2) {
    return null
  }

  const sorted = [...points].sort((first, second) => first.timestamp_ms - second.timestamp_ms)
  const end = sorted[sorted.length - 1]
  const start = sorted.find((point) => point.timestamp_ms >= end.timestamp_ms - windowMs) ?? sorted[0]

  const dt = end.timestamp_ms - start.timestamp_ms
  if (dt <= 0 || start.share_price <= 0 || end.share_price <= 0) {
    return null
  }

  const growth = end.share_price / start.share_price
  const periodsPerYear = YEAR_MS / dt
  return {
    apr: (growth - 1) * periodsPerYear,
    apy: Math.pow(growth, periodsPerYear) - 1,
    periodReturn: growth - 1,
    windowDays: dt / DAY_MS,
  }
}

export interface PerformanceMetric {
  label: string
  value: string
}

const compactNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
})

// Percent of a ratio (0.0103 -> "1.03%"), switching to compact notation past
// 1000% so an extreme value can never overflow its column.
function formatRatioPercent(ratio: number): string {
  const pct = ratio * 100
  return Math.abs(pct) >= 1000 ? `${compactNumber.format(pct)}%` : `${pct.toFixed(2)}%`
}

// A vault's headline return, always labelled "APY". Once there's enough history
// we annualize; below that, annualizing a few days explodes into nonsense, so we
// fall back to the realized return so far (still shown under "APY").
// Null/undefined -> dashes.
export function performanceMetric(metric: AnnualizedReturn | null | undefined): PerformanceMetric {
  if (metric === undefined || metric === null) {
    return { label: "APY", value: "—" }
  }
  const ratio = metric.windowDays < MIN_ANNUALIZE_DAYS ? metric.periodReturn : metric.apy
  return { label: "APY", value: formatRatioPercent(ratio) }
}
