import { PREDICT_PRICE_SCALE, QUOTE_SCALE } from "@/lib/config"
import type { StrategyState } from "./types"

const SHARE_SCALE = 1_000_000

export const sharePriceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 4,
})

export function formatDusdc(baseUnits: bigint, fractionDigits = 2): string {
  return `${(Number(baseUnits) / QUOTE_SCALE).toLocaleString("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  })} DUSDC`
}

// Quote (DUSDC) value rendered as dollars: "$1,234.56". Used across the strategy
// surfaces, where monetary figures read as USD rather than the token ticker.
export function formatUsd(baseUnits: bigint, fractionDigits = 2): string {
  return `$${(Number(baseUnits) / QUOTE_SCALE).toLocaleString("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  })}`
}

export function formatShares(units: bigint): string {
  return (Number(units) / SHARE_SCALE).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  })
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US")
}

export function formatStrikeUsd(strike: bigint): string {
  return `$${(Number(strike) / PREDICT_PRICE_SCALE).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`
}

export function truncateAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) {
    return address
  }
  return `${address.slice(0, lead)}…${address.slice(-tail)}`
}

// User-facing vault phase. "Open" = capital is cash, deposits/withdrawals settle
// instantly; "In round" = capital deployed in positions, deposits/withdrawals
// queue to the next settlement; "Paused" = circuit breaker.
export function getStrategyStatus(state: StrategyState): string {
  if (state.paused) {
    return "Paused"
  }
  return state.round ? "In round" : "Open"
}

// One-line plain-language hint that pairs with the status chip.
export function getStrategyStatusHint(state: StrategyState): string {
  if (state.paused) {
    return "Deposits and withdrawals are paused"
  }
  return state.round
    ? "Deposits and withdrawals queue to the next settlement"
    : "Deposits and withdrawals settle instantly"
}

/** Value of a holder's shares in quote base units, exact bigint math. */
export function positionValue(shareBalance: bigint, state: StrategyState): bigint {
  if (state.shareSupply <= 0n) {
    return 0n
  }
  return (shareBalance * state.nav) / state.shareSupply
}
