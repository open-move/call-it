export function formatCompactUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value >= 10_000 ? 0 : 1,
    notation: "compact",
    style: "currency",
  }).format(value)
}

export function formatUsd(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits,
    style: "currency",
  }).format(value)
}

export function formatRelativeTime(timestampMs: number, nowMs = Date.now()) {
  const seconds = Math.max(0, Math.round((nowMs - timestampMs) / 1000))

  if (seconds < 60) {
    return `${seconds}s ago`
  }

  const minutes = Math.round(seconds / 60)

  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)

  return `${hours}h ago`
}
