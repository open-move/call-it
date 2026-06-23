import type { StrategyKey } from "@/services/strategy-transactions"

export type StrategyShape = "single" | "dual" | "ladder"

/** Shape-tolerant view of a strategy's active round (fields present per shape). */
export interface StrategyRound {
  oracleId: string
  predictId: string
  /** Round's market expiry (epoch ms), read from the oracle object. Null if unreadable. */
  expiryMs: number | null
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
  /** Quote parked across the current deposit round (held aside, out of NAV). */
  pendingDepositsTotal: bigint
  /** Minted-but-unclaimed shares escrowed for settled depositors. */
  pendingSharePool: bigint
  /** Deposit queue's current round id; advances each settlement. */
  depositRound: number
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

/** A deposit parked while a round was live, awaiting (or ready for) settlement. */
export interface PendingDepositPosition {
  /** Quote parked. */
  amount: bigint
  /** The round the deposit was queued in. */
  round: number
  /** Its round has settled — `claim` will now deliver shares (or a refund). */
  settled: boolean
  /** The round minted nothing (dust); claiming refunds the quote 1:1. */
  isRefund: boolean
}

/** A withdrawal escrowed while a round was live, awaiting (or ready for) settlement. */
export interface PendingWithdrawalPosition {
  /** Shares escrowed. */
  shares: bigint
  /** The round the request was queued in. */
  round: number
  /** Its round has settled — `claim_withdrawal` will now deliver quote. */
  settled: boolean
}

/**
 * A wallet's full position in a strategy: liquid shares it holds plus any
 * in-flight deposit/withdrawal sitting in the round queues. Best-effort — the
 * per-user queue reads degrade to `null` if unavailable.
 */
export interface StrategyPosition {
  activeShares: bigint
  pendingDeposit: PendingDepositPosition | null
  pendingWithdrawal: PendingWithdrawalPosition | null
}
