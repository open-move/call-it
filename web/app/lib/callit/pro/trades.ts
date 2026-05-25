import { type DirectionalPositionMintEvent } from "~/lib/deepbook/predict-types"

import { type ProTrade } from "./types"

const PRICE_SCALE = 1_000_000_000
const QUOTE_SCALE = 1_000_000

export interface FilterProTradesOptions {
  oracleId: string
  expiryMs: number
  selectedStrikePriceUsd: number
}

function toUsdPrice(value: number) {
  return value / PRICE_SCALE
}

function isSameStrike(strike: number, selectedStrikePriceUsd: number) {
  return Math.abs(toUsdPrice(strike) - selectedStrikePriceUsd) < 0.000001
}

export function filterProTrades(
  events: DirectionalPositionMintEvent[],
  { expiryMs, oracleId, selectedStrikePriceUsd }: FilterProTradesOptions
): ProTrade[] {
  return events
    .filter(
      (event) =>
        event.oracle_id === oracleId &&
        event.expiry === expiryMs &&
        isSameStrike(event.strike, selectedStrikePriceUsd)
    )
    .map((event) => ({
      costUsd: event.cost / QUOTE_SCALE,
      id: event.event_digest,
      price: event.ask_price / PRICE_SCALE,
      quantity: event.quantity / QUOTE_SCALE,
      side: event.is_up ? ("above" as const) : ("below" as const),
      timestampMs: event.checkpoint_timestamp_ms,
      trader: event.trader,
    }))
    .sort(
      (firstTrade, secondTrade) =>
        secondTrade.timestampMs - firstTrade.timestampMs
    )
}
