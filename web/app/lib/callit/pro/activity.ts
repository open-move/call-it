import {
  type DirectionalPositionRedeemEvent,
  type RangeMintEvent,
  type RangeRedeemEvent,
} from "~/lib/deepbook/predict-types"

import {
  type ProRangeRedemption,
  type ProRangeTrade,
  type ProRedemption,
} from "./types"

const PRICE_SCALE = 1_000_000_000
const QUOTE_SCALE = 1_000_000

export interface FilterProActivityOptions {
  oracleId: string
  expiryMs: number
}

function toUsdPrice(value: number) {
  return value / PRICE_SCALE
}

function sortNewestFirst<T extends { timestampMs: number }>(rows: T[]) {
  return rows.sort(
    (firstRow, secondRow) => secondRow.timestampMs - firstRow.timestampMs
  )
}

export function filterProRedemptions(
  events: DirectionalPositionRedeemEvent[],
  { expiryMs, oracleId }: FilterProActivityOptions
): ProRedemption[] {
  return sortNewestFirst(
    events
      .filter(
        (event) => event.oracle_id === oracleId && event.expiry === expiryMs
      )
      .map((event) => ({
        bidPrice: event.bid_price / PRICE_SCALE,
        executor: event.executor,
        id: event.event_digest,
        isSettled: event.is_settled,
        owner: event.owner,
        payoutUsd: event.payout / QUOTE_SCALE,
        quantity: event.quantity / QUOTE_SCALE,
        side: event.is_up ? ("above" as const) : ("below" as const),
        strikePriceUsd: toUsdPrice(event.strike),
        timestampMs: event.checkpoint_timestamp_ms,
      }))
  )
}

export function filterProRangeTrades(
  events: RangeMintEvent[],
  { expiryMs, oracleId }: FilterProActivityOptions
): ProRangeTrade[] {
  return sortNewestFirst(
    events
      .filter(
        (event) => event.oracle_id === oracleId && event.expiry === expiryMs
      )
      .map((event) => ({
        costUsd: event.cost / QUOTE_SCALE,
        higherStrikePriceUsd: toUsdPrice(event.higher_strike),
        id: event.event_digest,
        lowerStrikePriceUsd: toUsdPrice(event.lower_strike),
        price: event.ask_price / PRICE_SCALE,
        quantity: event.quantity / QUOTE_SCALE,
        timestampMs: event.checkpoint_timestamp_ms,
        trader: event.trader,
      }))
  )
}

export function filterProRangeRedemptions(
  events: RangeRedeemEvent[],
  { expiryMs, oracleId }: FilterProActivityOptions
): ProRangeRedemption[] {
  return sortNewestFirst(
    events
      .filter(
        (event) => event.oracle_id === oracleId && event.expiry === expiryMs
      )
      .map((event) => ({
        bidPrice: event.bid_price / PRICE_SCALE,
        higherStrikePriceUsd: toUsdPrice(event.higher_strike),
        id: event.event_digest,
        isSettled: event.is_settled,
        lowerStrikePriceUsd: toUsdPrice(event.lower_strike),
        payoutUsd: event.payout / QUOTE_SCALE,
        quantity: event.quantity / QUOTE_SCALE,
        timestampMs: event.checkpoint_timestamp_ms,
        trader: event.trader,
      }))
  )
}
