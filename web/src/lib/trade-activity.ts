import { QUOTE_SCALE, PREDICT_PRICE_SCALE as PRICE_SCALE } from "@/lib/config"
import type {
  DirectionalPositionRedeemEvent,
  OracleInfo,
  RangeMintEvent,
  RangeRedeemEvent,
} from "@/lib/types/predict"

import type {
  Position,
  PositionRow,
  RangePosition,
  RangeRedemption,
  RangeTrade,
  Redemption,
  RedemptionActivityRow,
  Trade,
  TradeActivityRow,
} from "@/lib/types/trade"

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
        transactionDigest: event.digest,
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
        transactionDigest: event.digest,
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
        transactionDigest: event.digest,
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
  expiry: number
  higherStrike: number
  lastActivityAt: number
  lowerStrike: number
  managerId: string
  mintedQuantity: number
  oracleId: string
  totalCost: number
  totalPayout: number
  redeemedQuantity: number
}

function getRangePositionKey(event: RangeMintEvent | RangeRedeemEvent) {
  return `${event.manager_id}:${event.oracle_id}:${event.expiry}:${event.lower_strike}:${event.higher_strike}`
}

export function getSettledRangeMarkValue({
  higherStrike,
  lowerStrike,
  openQuantity,
  oracle,
}: {
  higherStrike: number
  lowerStrike: number
  openQuantity: number
  oracle?: OracleInfo
}) {
  if (oracle?.status !== "settled" || oracle.settlement_price === null) {
    return null
  }

  const isInRange =
    oracle.settlement_price > lowerStrike &&
    oracle.settlement_price <= higherStrike

  return isInRange ? openQuantity : 0
}

export function getRangePositionStatus({
  markValue,
  openQuantity,
  oracle,
  expiry,
}: {
  expiry: number
  markValue: number | null
  openQuantity: number
  oracle?: OracleInfo
}) {
  if (openQuantity <= 0) {
    return "redeemed"
  }

  if (oracle?.status === "settled") {
    return (markValue ?? 0) > 0 ? "redeemable" : "lost"
  }

  if (Date.now() >= expiry) {
    return "awaiting_settlement"
  }

  return "active"
}

export function getRangePositionsFromActivity(
  mintedEvents: RangeMintEvent[],
  redeemedEvents: RangeRedeemEvent[],
  filter?: FilterActivityOptions,
  oracleById = new Map<string, OracleInfo>()
): RangePosition[] {
  const positions = new Map<string, RangePositionAccumulator>()

  function getAccumulator(event: RangeMintEvent | RangeRedeemEvent) {
    const key = getRangePositionKey(event)
    const existingPosition = positions.get(key)

    if (existingPosition) {
      return existingPosition
    }

    const position = {
      expiry: event.expiry,
      higherStrike: event.higher_strike,
      lastActivityAt: event.checkpoint_timestamp_ms,
      lowerStrike: event.lower_strike,
      managerId: event.manager_id,
      mintedQuantity: 0,
      oracleId: event.oracle_id,
      redeemedQuantity: 0,
      totalCost: 0,
      totalPayout: 0,
    }

    positions.set(key, position)
    return position
  }

  mintedEvents
    .filter(
      (event) =>
        !filter ||
        (event.oracle_id === filter.oracleId && event.expiry === filter.expiryMs)
    )
    .forEach((event) => {
      const position = getAccumulator(event)

      position.mintedQuantity += event.quantity
      position.totalCost += event.cost
      position.lastActivityAt = Math.max(
        position.lastActivityAt,
        event.checkpoint_timestamp_ms
      )
    })

  redeemedEvents
    .filter(
      (event) =>
        !filter ||
        (event.oracle_id === filter.oracleId && event.expiry === filter.expiryMs)
    )
    .forEach((event) => {
      const position = getAccumulator(event)

      position.redeemedQuantity += event.quantity
      position.totalPayout += event.payout
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
        const oracle = oracleById.get(position.oracleId)
        const rawOpenQuantity = Math.max(
          position.mintedQuantity - position.redeemedQuantity,
          0
        )
        const markValue = getSettledRangeMarkValue({
          higherStrike: position.higherStrike,
          lowerStrike: position.lowerStrike,
          openQuantity: rawOpenQuantity,
          oracle,
        })
        const markValueUsd =
          markValue === null ? null : toQuoteAmount(markValue)
        const markPrice =
          markValueUsd === null || openQuantity <= 0
            ? null
            : markValueUsd / openQuantity
        const openCostBasisUsd =
          averageEntryPrice === null ? 0 : averageEntryPrice * openQuantity

        return {
          averageEntryPrice,
          expiryMs: position.expiry,
          higherStrikePriceUsd: toUsdPrice(position.higherStrike),
          id,
          lastActivityAt: position.lastActivityAt,
          lowerStrikePriceUsd: toUsdPrice(position.lowerStrike),
          managerId: position.managerId,
          markPrice,
          markValueUsd,
          oracleId: position.oracleId,
          openCostBasisUsd,
          openQuantity,
          realizedPnlUsd:
            toQuoteAmount(position.totalPayout) - redeemedCostBasis,
          status: getRangePositionStatus({
            expiry: position.expiry,
            markValue,
            openQuantity: rawOpenQuantity,
            oracle,
          }),
          unrealizedPnlUsd:
            markValueUsd === null ? null : markValueUsd - openCostBasisUsd,
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
