export interface PerformancePoint {
  share_price: number
  timestamp_ms: number
}

export interface AnnualizedReturn {
  apr: number
  apy: number
  windowDays: number
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

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
    windowDays: dt / DAY_MS,
  }
}

export function apyWindowLabel(windowDays?: number | null): string {
  if (windowDays === undefined || windowDays === null || windowDays >= 29.5) {
    return "30D APY"
  }
  if (windowDays < 1) {
    return "<1D APY"
  }
  return `${Math.max(1, Math.round(windowDays))}D APY`
}
