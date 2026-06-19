export function formatUsd(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits,
    style: "currency",
  }).format(value)
}

export function formatCompactUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value >= 10_000 ? 0 : 1,
    notation: "compact",
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

export function formatUpdated(timestampMs: number) {
  return formatRelativeTime(timestampMs)
}

const expiryFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
})

const marketTitleExpiryFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
})

const expiryDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
})

const expiryTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  timeZone: "UTC",
})

export function formatExpiry(expiryMs: number) {
  return expiryFormatter.format(new Date(expiryMs))
}

export function formatMarketTitleExpiry(expiryMs: number) {
  return marketTitleExpiryFormatter.format(new Date(expiryMs))
}

export function formatExpiryDate(expiryMs: number) {
  return expiryDateFormatter.format(new Date(expiryMs)).toUpperCase()
}

export function formatExpiryTime(expiryMs: number) {
  return expiryTimeFormatter.format(new Date(expiryMs))
}

export function formatExpiryDistance(expiryMs: number, nowMs = Date.now()) {
  const remainingMs = expiryMs - nowMs

  if (remainingMs <= 0) {
    return "Expired"
  }

  const totalSeconds = Math.round(remainingMs / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes < 60) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours < 48) {
    return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}m`
  }

  return `${Math.round(hours / 24)}d`
}

export function formatSignedUsd(value: number) {
  const displayValue = Math.abs(value) < 0.5 ? 0 : value

  return `${displayValue >= 0 ? "+" : ""}${formatUsd(displayValue, 0)}`
}

export function formatSignedPercent(value: number) {
  const displayValue = Math.abs(value) < 0.005 ? 0 : value

  return `${displayValue >= 0 ? "+" : ""}${displayValue.toFixed(2)}%`
}

export function formatStatus(status: string) {
  if (status === "active") {
    return "Live"
  }

  if (status === "expired") {
    return "Expired"
  }

  return status
}

export function formatProbability(value: number | undefined) {
  return value === undefined ? "--" : `${Math.round(value * 100)}%`
}

export function formatPriceCents(price: number) {
  return `${(price * 100).toFixed(1)}¢`
}

export function formatQuantity(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })
}

export function formatTradeTime(timestampMs: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  }).format(timestampMs)
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value)
}
