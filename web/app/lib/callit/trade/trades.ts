import { type DirectionalPositionMintEvent } from "~/lib/deepbook/predict-types"

import { type Trade } from "./types"

const PRICE_SCALE = 1_000_000_000
const QUOTE_SCALE = 1_000_000

export interface FilterTradesOptions {
  oracleId: string
  expiryMs: number
}

function toUsdPrice(value: number) {
  return value / PRICE_SCALE
}

export function filterTrades(
  events: DirectionalPositionMintEvent[],
  { expiryMs, oracleId }: FilterTradesOptions
): Trade[] {
  return events
    .filter(
      (event) => event.oracle_id === oracleId && event.expiry === expiryMs
    )
    .map((event) => ({
      costUsd: event.cost / QUOTE_SCALE,
      id: event.event_digest,
      price: event.ask_price / PRICE_SCALE,
      quantity: event.quantity / QUOTE_SCALE,
      side: event.is_up ? ("above" as const) : ("below" as const),
      strikePriceUsd: toUsdPrice(event.strike),
      timestampMs: event.checkpoint_timestamp_ms,
      trader: event.trader,
    }))
    .sort(
      (firstTrade, secondTrade) =>
        secondTrade.timestampMs - firstTrade.timestampMs
    )
}
