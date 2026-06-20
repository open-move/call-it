import {
  getManagerPositions,
  getManagerPositionSummaries,
  getManagerRanges,
} from "@/services/predict-client"
import {
  getPositionRows,
  getRangePositionsFromActivity,
} from "@/lib/trade-activity"
import {
  filterPositions,
  getPositionSummariesFromActivity,
} from "@/lib/trade-positions"
import type { FilterPositionsOptions } from "@/lib/trade-positions"
import type {
  ManagerPositionSummary,
  ManagerRangeActivityResponse,
  OracleInfo,
} from "@/lib/types/predict"
import type { PositionRow } from "@/lib/types/trade"

export interface PredictPositionSourceResult {
  managerId?: string
  rangeActivity: ManagerRangeActivityResponse
  rows: PositionRow[]
  summaries: ManagerPositionSummary[]
}

export interface LoadManagerPredictPositionsOptions {
  filter?: FilterPositionsOptions
  managerId?: string
  oracleById: Map<string, OracleInfo>
}

const emptyRangeActivity = { minted: [], redeemed: [] }

export async function loadManagerPredictPositions({
  filter,
  managerId,
  oracleById,
}: LoadManagerPredictPositionsOptions): Promise<PredictPositionSourceResult> {
  if (!managerId) {
    return {
      rangeActivity: emptyRangeActivity,
      rows: [],
      summaries: [],
    }
  }

  const [summaryResult, rangeActivity] = await Promise.all([
    getManagerPositionSummaries(managerId).catch(() => undefined),
    getManagerRanges(managerId).catch(() => emptyRangeActivity),
  ])
  const summaries =
    summaryResult ??
    getPositionSummariesFromActivity(
      await getManagerPositions(managerId).catch(() => ({
        minted: [],
        redeemed: [],
      })),
      oracleById
    )
  const directionalPositions = filterPositions(summaries, filter)
  const rangePositions = getRangePositionsFromActivity(
    rangeActivity.minted,
    rangeActivity.redeemed,
    filter,
    oracleById
  )

  return {
    managerId,
    rangeActivity,
    rows: getPositionRows(directionalPositions, rangePositions),
    summaries,
  }
}
