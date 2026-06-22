import { formatDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS, QUOTE_SCALE } from "@/lib/config"

export const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "percent",
})

export const sharePriceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
  minimumFractionDigits: 6,
})

export const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
})

export function toQuoteUsd(value: number) {
  return value / QUOTE_SCALE
}

export function formatTokenAmount(
  value: number,
  symbol: string,
  maximumFractionDigits = 4
) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })} ${symbol}`
}

export function formatQuoteAmount(value: number, symbol = "DUSDC") {
  return formatTokenAmount(toQuoteUsd(value), symbol)
}

// Render a quote (DUSDC) amount as a USD value: "$1,234.56". DUSDC is a USD
// stablecoin, so monetary figures read as dollars across the product surfaces.
// `formatQuoteUsd` takes quote base units (server numbers); `formatUsd` takes an
// already-USD number; `formatWalletUsd` takes wallet base units (bigint).
export function formatQuoteUsd(value: number, maximumFractionDigits = 2) {
  return `$${toQuoteUsd(value).toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 2,
  })}`
}

export function formatUsd(value: number, maximumFractionDigits = 2) {
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 2,
  })}`
}

export function formatWalletUsd(value: bigint, maxDecimals = 2) {
  return `$${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, maxDecimals)}`
}

export function formatWalletAmount(value: bigint, symbol: string, maxDecimals = 4) {
  return `${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, maxDecimals)} ${symbol}`
}

export function formatSharePrice(value: number) {
  return sharePriceFormatter.format(value)
}

export function formatPercent(value: number) {
  return percentFormatter.format(value)
}

export function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
