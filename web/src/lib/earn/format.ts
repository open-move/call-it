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
