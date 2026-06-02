import {
  type DirectionalPositionRedeemEvent,
  type RangeMintEvent,
  type RangeRedeemEvent,
} from "~/lib/deepbook/predict-types"

import {
  type Position,
  type PositionRow,
  type RangePosition,
  type RangeRedemption,
  type RangeTrade,
  type Redemption,
  type RedemptionActivityRow,
  type Trade,
  type TradeActivityRow,
} from "./types"

const PRICE_SCALE = 1_000_000_000
const QUOTE_SCALE = 1_000_000

export interface FilterActivityOptions {
  oracleId: string
  expiryMs: number
}

function toUsdPrice(value: number) {
  return value / PRICE_SCALE
}

function toQuoteAmount(value: number) {
  return value / QUOTE_SCALE
}

function sortNewestFirst<T extends { timestampMs: number }>(rows: T[]) {
  return rows.sort(
    (firstRow, secondRow) => secondRow.timestampMs - firstRow.timestampMs
  )
}

function sortActivityRowsNewestFirst<
  T extends { id: string; timestampMs: number },
>(rows: T[]) {
  return rows.sort(
    (firstRow, secondRow) =>
      secondRow.timestampMs - firstRow.timestampMs ||
      firstRow.id.localeCompare(secondRow.id)
  )
}

function sortPositionRowsNewestFirst<
  T extends { id: string; lastActivityAt: number },
>(rows: T[]) {
  return rows.sort(
    (firstRow, secondRow) =>
      secondRow.lastActivityAt - firstRow.lastActivityAt ||
      firstRow.id.localeCompare(secondRow.id)
  )
}

export function filterRedemptions(
  events: DirectionalPositionRedeemEvent[],
  { expiryMs, oracleId }: FilterActivityOptions
): Redemption[] {
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
        payoutUsd: toQuoteAmount(event.payout),
        quantity: toQuoteAmount(event.quantity),
        side: event.is_up ? ("above" as const) : ("below" as const),
        strikePriceUsd: toUsdPrice(event.strike),
        timestampMs: event.checkpoint_timestamp_ms,
      }))
  )
}

export function filterRangeTrades(
  events: RangeMintEvent[],
  { expiryMs, oracleId }: FilterActivityOptions
): RangeTrade[] {
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

export function filterRangeRedemptions(
  events: RangeRedeemEvent[],
  { expiryMs, oracleId }: FilterActivityOptions
): RangeRedemption[] {
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

export function getTradeActivityRows(
  trades: Trade[],
  rangeTrades: RangeTrade[]
): TradeActivityRow[] {
  return sortActivityRowsNewestFirst([
    ...trades.map((trade) => ({ ...trade, kind: "directional" as const })),
    ...rangeTrades.map((trade) => ({ ...trade, kind: "range" as const })),
  ])
}

export function getRedemptionActivityRows(
  redemptions: Redemption[],
  rangeRedemptions: RangeRedemption[]
): RedemptionActivityRow[] {
  return sortActivityRowsNewestFirst([
    ...redemptions.map((redemption) => ({
      ...redemption,
      kind: "directional" as const,
    })),
    ...rangeRedemptions.map((redemption) => ({
      ...redemption,
      kind: "range" as const,
    })),
  ])
}

interface RangePositionAccumulator {
  higherStrike: number
  lastActivityAt: number
  lowerStrike: number
  mintedQuantity: number
  orderIds: Set<string>
  totalCost: number
  totalPayout: number
  redeemedQuantity: number
}

function getRangePositionKey(event: RangeMintEvent | RangeRedeemEvent) {
  return `${event.manager_id}:${event.oracle_id}:${event.expiry}:${event.lower_strike}:${event.higher_strike}`
}

export function getRangePositionsFromActivity(
  mintedEvents: RangeMintEvent[],
  redeemedEvents: RangeRedeemEvent[],
  { expiryMs, oracleId }: FilterActivityOptions
): RangePosition[] {
  const positions = new Map<string, RangePositionAccumulator>()

  function getAccumulator(event: RangeMintEvent | RangeRedeemEvent) {
    const key = getRangePositionKey(event)
    const existingPosition = positions.get(key)

    if (existingPosition) {
      return existingPosition
    }

    const position = {
      higherStrike: event.higher_strike,
      lastActivityAt: event.checkpoint_timestamp_ms,
      lowerStrike: event.lower_strike,
      mintedQuantity: 0,
      orderIds: new Set<string>(),
      redeemedQuantity: 0,
      totalCost: 0,
      totalPayout: 0,
    }

    positions.set(key, position)
    return position
  }

  mintedEvents
    .filter(
      (event) => event.oracle_id === oracleId && event.expiry === expiryMs
    )
    .forEach((event) => {
      const position = getAccumulator(event)

      position.mintedQuantity += event.quantity
      position.totalCost += event.cost
      if (event.order_id) {
        position.orderIds.add(event.order_id)
      }
      position.lastActivityAt = Math.max(
        position.lastActivityAt,
        event.checkpoint_timestamp_ms
      )
    })

  redeemedEvents
    .filter(
      (event) => event.oracle_id === oracleId && event.expiry === expiryMs
    )
    .forEach((event) => {
      const position = getAccumulator(event)

      position.redeemedQuantity += event.quantity
      position.totalPayout += event.payout
      if (event.order_id) {
        position.orderIds.add(event.order_id)
      }
      position.lastActivityAt = Math.max(
        position.lastActivityAt,
        event.checkpoint_timestamp_ms
      )
    })

  return sortPositionRowsNewestFirst(
    Array.from(positions.entries())
      .map(([id, position]) => {
        const mintedQuantity = toQuoteAmount(position.mintedQuantity)
        const redeemedQuantity = toQuoteAmount(position.redeemedQuantity)
        const openQuantity = Math.max(mintedQuantity - redeemedQuantity, 0)
        const averageEntryPrice =
          mintedQuantity > 0
            ? toQuoteAmount(position.totalCost) / mintedQuantity
            : null
        const redeemedCostBasis =
          averageEntryPrice === null ? 0 : averageEntryPrice * redeemedQuantity

        return {
          averageEntryPrice,
          higherStrikePriceUsd: toUsdPrice(position.higherStrike),
          id,
          lastActivityAt: position.lastActivityAt,
          lowerStrikePriceUsd: toUsdPrice(position.lowerStrike),
          markPrice: null,
          markValueUsd: null,
          openCostBasisUsd:
            averageEntryPrice === null ? 0 : averageEntryPrice * openQuantity,
          openQuantity,
          orderIds: Array.from(position.orderIds),
          realizedPnlUsd:
            toQuoteAmount(position.totalPayout) - redeemedCostBasis,
          status: "open",
          unrealizedPnlUsd: null,
        }
      })
      .filter((position) => position.openQuantity > 0)
  )
}

export function getPositionRows(
  positions: Position[],
  rangePositions: RangePosition[]
): PositionRow[] {
  return sortPositionRowsNewestFirst([
    ...positions.map((position) => ({
      ...position,
      kind: "directional" as const,
    })),
    ...rangePositions.map((position) => ({
      ...position,
      kind: "range" as const,
    })),
  ])
}
