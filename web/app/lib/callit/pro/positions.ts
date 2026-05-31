import { type ManagerPositionSummary } from "~/lib/deepbook/predict-types"

import { type ProPosition } from "./types"

const PRICE_SCALE = 1_000_000_000
const QUOTE_SCALE = 1_000_000

export interface FilterProPositionsOptions {
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

export function filterProPositions(
  summaries: ManagerPositionSummary[],
  { expiryMs, oracleId }: FilterProPositionsOptions
): ProPosition[] {
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
      unrealizedPnlUsd: toQuoteAmount(summary.unrealized_pnl),
    }))
    .sort(
      (firstPosition, secondPosition) =>
        secondPosition.lastActivityAt - firstPosition.lastActivityAt
    )
}
