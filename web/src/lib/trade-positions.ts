import { QUOTE_SCALE, PREDICT_PRICE_SCALE as PRICE_SCALE } from "@/lib/config"
import type {
  DirectionalPositionMintEvent,
  DirectionalPositionRedeemEvent,
  ManagerPositionActivityResponse,
  ManagerPositionSummary,
  OracleInfo,
} from "@/lib/types/predict"

import type { Position } from "@/lib/types/trade"

export interface FilterPositionsOptions {
  oracleId: string
  expiryMs: number
}

function toUsdPrice(value: number) {
  return value / PRICE_SCALE
}

function toQuoteAmount(value: number) {
  return value / QUOTE_SCALE
}

function toNullablePrice(value: number | null) {
  return value === null ? null : toUsdPrice(value)
}

interface DirectionalPositionAccumulator {
  expiry: number
  firstMintedAt: number
  isUp: boolean
  lastActivityAt: number
  managerId: string
  mintedQuantity: number
  oracleId: string
  predictId: string
  quoteAsset: string
  redeemedQuantity: number
  strike: number
  totalCost: number
  totalPayout: number
}

function getPositionKey(
  event: DirectionalPositionMintEvent | DirectionalPositionRedeemEvent
) {
  return `${event.manager_id}:${event.oracle_id}:${event.expiry}:${event.strike}:${event.is_up ? "up" : "down"}`
}

function scalePositionPrice(amount: number, quantity: number) {
  if (quantity <= 0) {
    return null
  }

  return Number(
    (BigInt(Math.trunc(amount)) * BigInt(PRICE_SCALE)) /
      BigInt(Math.trunc(quantity))
  )
}

function getClosedCostBasis(
  totalCost: number,
  redeemed: number,
  minted: number
) {
  if (minted <= 0) {
    return 0
  }

  return Number(
    (BigInt(Math.trunc(totalCost)) * BigInt(Math.trunc(redeemed))) /
      BigInt(Math.trunc(minted))
  )
}

function getSettledMarkValue({
  isUp,
  openQuantity,
  oracle,
  strike,
}: {
  isUp: boolean
  openQuantity: number
  oracle?: OracleInfo
  strike: number
}) {
  if (oracle?.status !== "settled" || oracle.settlement_price === null) {
    return null
  }

  const didWin = isUp
    ? oracle.settlement_price > strike
    : oracle.settlement_price <= strike

  return didWin ? openQuantity : 0
}

function getFallbackPositionStatus({
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

export function getPositionSummariesFromActivity(
  activity: ManagerPositionActivityResponse,
  oracleById: Map<string, OracleInfo>
): ManagerPositionSummary[] {
  const positions = new Map<string, DirectionalPositionAccumulator>()

  function getAccumulator(
    event: DirectionalPositionMintEvent | DirectionalPositionRedeemEvent
  ) {
    const key = getPositionKey(event)
    const currentPosition = positions.get(key)

    if (currentPosition) {
      return currentPosition
    }

    const position = {
      expiry: event.expiry,
      firstMintedAt: event.checkpoint_timestamp_ms,
      isUp: event.is_up,
      lastActivityAt: event.checkpoint_timestamp_ms,
      managerId: event.manager_id,
      mintedQuantity: 0,
      oracleId: event.oracle_id,
      predictId: event.predict_id,
      quoteAsset: event.quote_asset,
      redeemedQuantity: 0,
      strike: event.strike,
      totalCost: 0,
      totalPayout: 0,
    }

    positions.set(key, position)
    return position
  }

  for (const event of activity.minted) {
    const position = getAccumulator(event)

    position.mintedQuantity += event.quantity
    position.totalCost += event.cost
    position.firstMintedAt = Math.min(
      position.firstMintedAt,
      event.checkpoint_timestamp_ms
    )
    position.lastActivityAt = Math.max(
      position.lastActivityAt,
      event.checkpoint_timestamp_ms
    )
  }

  for (const event of activity.redeemed) {
    const position = getAccumulator(event)

    position.redeemedQuantity += event.quantity
    position.totalPayout += event.payout
    position.lastActivityAt = Math.max(
      position.lastActivityAt,
      event.checkpoint_timestamp_ms
    )
  }

  return Array.from(positions.values())
    .map((position) => {
      const mintedQuantity = Math.max(position.mintedQuantity, 0)
      const redeemedQuantity = Math.min(
        Math.max(position.redeemedQuantity, 0),
        mintedQuantity
      )
      const openQuantity = mintedQuantity - redeemedQuantity
      const closedCostBasis = getClosedCostBasis(
        position.totalCost,
        redeemedQuantity,
        mintedQuantity
      )
      const openCostBasis = Math.max(position.totalCost - closedCostBasis, 0)
      const markValue = getSettledMarkValue({
        isUp: position.isUp,
        openQuantity,
        oracle: oracleById.get(position.oracleId),
        strike: position.strike,
      })
      const markPrice =
        markValue === null
          ? null
          : openQuantity > 0
            ? scalePositionPrice(markValue, openQuantity)
            : null
      const realizedPnl = position.totalPayout - closedCostBasis
      const unrealizedPnl = markValue === null ? 0 : markValue - openCostBasis
      const oracle = oracleById.get(position.oracleId)

      return {
        average_entry_price: scalePositionPrice(
          position.totalCost,
          mintedQuantity
        ),
        average_exit_price: scalePositionPrice(
          position.totalPayout,
          redeemedQuantity
        ),
        expiry: position.expiry,
        first_minted_at: position.firstMintedAt,
        is_up: position.isUp,
        last_activity_at: position.lastActivityAt,
        manager_id: position.managerId,
        mark_price: markPrice,
        mark_value: markValue,
        minted_quantity: mintedQuantity,
        open_cost_basis: openCostBasis,
        open_quantity: openQuantity,
        oracle_id: position.oracleId,
        predict_id: position.predictId,
        quote_asset: position.quoteAsset,
        realized_pnl: realizedPnl,
        redeemed_quantity: redeemedQuantity,
        status: getFallbackPositionStatus({
          expiry: position.expiry,
          markValue,
          openQuantity,
          oracle,
        }),
        strike: position.strike,
        total_cost: position.totalCost,
        total_payout: position.totalPayout,
        underlying_asset: oracle?.underlying_asset ?? null,
        unrealized_pnl: unrealizedPnl,
      } satisfies ManagerPositionSummary
    })
    .sort(
      (firstPosition, secondPosition) =>
        secondPosition.last_activity_at - firstPosition.last_activity_at
    )
}

export function filterPositions(
  summaries: ManagerPositionSummary[],
  { expiryMs, oracleId }: FilterPositionsOptions
): Position[] {
  return summaries
    .filter(
      (summary) =>
        summary.oracle_id === oracleId &&
        summary.expiry === expiryMs &&
        summary.open_quantity > 0
    )
    .map((summary) => ({
      averageEntryPrice: toNullablePrice(summary.average_entry_price),
      id: `${summary.manager_id}:${summary.oracle_id}:${summary.strike}:${summary.is_up ? "up" : "down"}`,
      lastActivityAt: summary.last_activity_at,
      markPrice: toNullablePrice(summary.mark_price),
      markValueUsd:
        summary.mark_value === null ? null : toQuoteAmount(summary.mark_value),
      openCostBasisUsd: toQuoteAmount(summary.open_cost_basis),
      openQuantity: toQuoteAmount(summary.open_quantity),
      realizedPnlUsd: toQuoteAmount(summary.realized_pnl),
      side: summary.is_up ? ("above" as const) : ("below" as const),
      status: summary.status,
      strikePriceUsd: toUsdPrice(summary.strike),
      unrealizedPnlUsd:
        summary.mark_value === null
          ? null
          : toQuoteAmount(summary.unrealized_pnl),
    }))
    .sort(
      (firstPosition, secondPosition) =>
        secondPosition.lastActivityAt - firstPosition.lastActivityAt
    )
}
