import type { StrategyKey } from "@/services/strategy-transactions"

export type StrategyShape = "single" | "dual" | "ladder"

/** Shape-tolerant view of a strategy's active round (fields present per shape). */
export interface StrategyRound {
  oracleId: string
  predictId: string
  // single (hedged-plp, bullish-upside)
  strike: bigint | null
  quantity: bigint | null
  // dual (strangle, plp-collar)
  downStrike: bigint | null
  upStrike: bigint | null
  downQuantity: bigint | null
  upQuantity: bigint | null
  // ladder (range-ladder)
  positionCount: number | null
}

/** Unified, on-chain-derived strategy state used across the strategy surface. */
export interface StrategyState {
  key: StrategyKey
  strategyId: string
  baseVaultId: string
  managerId: string
  nav: bigint
  shareSupply: bigint
  sharePrice: number
  baseShares: bigint
  reservedBaseShares: bigint
  pendingShares: bigint
  plpAmount: bigint | null
  plpCostBasis: bigint | null
  staleGraceRounds: number
  paused: boolean
  round: StrategyRound | null
  /** Raw policy bps/counts by field name (e.g. hedge_budget_bps), for allocation + policy panels. */
  policy: Record<string, number>
}

export interface StrategyWalletState {
  dusdcBalance: bigint
  shareBalance: bigint
}
