import type {
  DirectionalPositionMintEvent,
  DirectionalPositionRedeemEvent,
  RangeMintEvent,
  RangeRedeemEvent,
} from "@/lib/types/predict"

export interface LeaderboardInput {
  directionalMints: DirectionalPositionMintEvent[]
  directionalRedeems: DirectionalPositionRedeemEvent[]
  generatedAtMs?: number
  rangeMints: RangeMintEvent[]
  rangeRedeems: RangeRedeemEvent[]
}

export type LeaderboardPeriod = "today" | "weekly" | "monthly" | "allTime"

export interface LeaderboardAccountRow {
  account: string
  activityCount: number
  directionalCount: number
  lastActivityAtMs: number
  openCostBasisUsd: number
  rank: number
  rangeCount: number
  realizedPayoutUsd: number
  realizedPnlPct: number | null
  realizedPnlUsd: number
  redeemedCostBasisUsd: number
  settledCount: number
  volumeUsd: number
  winRate: number | null
  wins: number
}

export interface LeaderboardTotals {
  accounts: number
  activityCount: number
  openCostBasisUsd: number
  realizedPnlUsd: number
  volumeUsd: number
}

export interface LeaderboardModel {
  assumptions: string[]
  generatedAtMs: number
  rows: LeaderboardAccountRow[]
  totals: LeaderboardTotals
}

export type LeaderboardPeriodModels = Record<
  LeaderboardPeriod,
  LeaderboardModel
>

export interface LeaderboardReport {
  assumptions: string[]
  generatedAt: string
  rows: LeaderboardAccountRow[]
  totals: LeaderboardTotals
}
