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

// Below this much history, annualizing a share-price move is meaningless (a few
// days of a volatile vault extrapolated to a year explodes). Callers should
// surface `periodReturn` instead of `apy`/`apr` under this threshold.
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
  if (end === undefined) {
    return null
  }
  const start = sorted.find((point) => point.timestamp_ms >= end.timestamp_ms - windowMs) ?? sorted[0]
  if (start === undefined) {
    return null
  }

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
