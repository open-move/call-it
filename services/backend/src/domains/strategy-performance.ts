import { bcs } from "@mysten/sui/bcs"
import { z } from "zod"

import type { CheckpointEvent } from "../sui/checkpoint.ts"
import { normalizeAddress, parseEventType } from "../sui/bcs.ts"

export const STRATEGY_MODULE = "strategy"

export type StrategyPipelineKind =
  | "bullish-upside"
  | "hedged-plp"
  | "plp-collar"
  | "range-ladder"
  | "strangle"

export type StrategySnapshotKind = "deposit" | "fold" | "settle" | "withdraw"

export type StrategyPerformanceEvent =
  | {
      kind: "deposit"
      navBefore: bigint
      sharesMinted: bigint
      strategyId: string
    }
  | {
      kind: "fold"
      navBefore: bigint
      round: number
      sharesMinted: bigint
      strategyId: string
    }
  | {
      kind: "withdraw"
      navBefore: bigint
      sharesBurned: bigint
      strategyId: string
    }
  | {
      kind: "settle"
      navAfterSettle: bigint
      round: number
      sharesBurned: bigint
      strategyId: string
    }
  | {
      kind: "sweep"
      sharesReissued: bigint
      strategyId: string
    }

export interface StrategyFoldState {
  lastRound: number | null
  supply: bigint
}

export interface StrategySnapshotAnchor {
  kind: StrategySnapshotKind
  nav: bigint
  sharePrice: number
  totalShares: bigint
}

export interface StrategyFoldResult {
  snapshot: StrategySnapshotAnchor | null
  state: StrategyFoldState
}

const u64Schema = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative(), z.bigint().nonnegative()])
  .transform((value) => BigInt(value))

const addressSchema = z.string().transform((value) => normalizeAddress(value))

const depositedStruct = bcs.struct("StrategyDeposited", {
  strategy_id: bcs.Address,
  depositor: bcs.Address,
  amount: bcs.u64(),
  shares_minted: bcs.u64(),
  nav_before: bcs.u64(),
})

const depositsSettledStruct = bcs.struct("DepositsSettled", {
  strategy_id: bcs.Address,
  round: bcs.u64(),
  quote_folded: bcs.u64(),
  shares_minted: bcs.u64(),
  nav_before: bcs.u64(),
})

const withdrawnStruct = bcs.struct("StrategyWithdrawn", {
  strategy_id: bcs.Address,
  owner: bcs.Address,
  shares_burned: bcs.u64(),
  amount_out: bcs.u64(),
  nav_before: bcs.u64(),
})

const withdrawalSweptStruct = bcs.struct("WithdrawalSwept", {
  strategy_id: bcs.Address,
  owner: bcs.Address,
  base_shares: bcs.u64(),
  shares_reissued: bcs.u64(),
})

const hedgedPlpRoundSettledStruct = bcs.struct("HedgedPlpRoundSettled", {
  strategy_id: bcs.Address,
  predict_id: bcs.Address,
  manager_id: bcs.Address,
  oracle_id: bcs.Address,
  round: bcs.u64(),
  payout_swept: bcs.u64(),
  plp_realized: bcs.u64(),
  reserved_base_shares: bcs.u64(),
  shares_burned: bcs.u64(),
  nav_after_settle: bcs.u64(),
})

const plpCollarRoundSettledStruct = bcs.struct("PlpCollarRoundSettled", {
  strategy_id: bcs.Address,
  predict_id: bcs.Address,
  manager_id: bcs.Address,
  oracle_id: bcs.Address,
  round: bcs.u64(),
  manager_balance_swept: bcs.u64(),
  plp_realized: bcs.u64(),
  reserved_base_shares: bcs.u64(),
  shares_burned: bcs.u64(),
  nav_after_settle: bcs.u64(),
})

const standardRoundSettledStruct = bcs.struct("StandardRoundSettled", {
  strategy_id: bcs.Address,
  predict_id: bcs.Address,
  manager_id: bcs.Address,
  oracle_id: bcs.Address,
  round: bcs.u64(),
  manager_balance_swept: bcs.u64(),
  reserved_base_shares: bcs.u64(),
  shares_burned: bcs.u64(),
  nav_after_settle: bcs.u64(),
})

const rangeLadderRoundSettledStruct = bcs.struct("RangeLadderRoundSettled", {
  strategy_id: bcs.Address,
  predict_id: bcs.Address,
  manager_id: bcs.Address,
  oracle_id: bcs.Address,
  round: bcs.u64(),
  payout_swept: bcs.u64(),
  reserved_base_shares: bcs.u64(),
  shares_burned: bcs.u64(),
  nav_after_settle: bcs.u64(),
})

const depositedSchema = z
  .object({
    nav_before: u64Schema,
    shares_minted: u64Schema,
    strategy_id: addressSchema,
  })
  .transform(
    (raw): StrategyPerformanceEvent => ({
      kind: "deposit",
      navBefore: raw.nav_before,
      sharesMinted: raw.shares_minted,
      strategyId: raw.strategy_id,
    })
  )

const depositsSettledSchema = z
  .object({
    nav_before: u64Schema,
    round: u64Schema,
    shares_minted: u64Schema,
    strategy_id: addressSchema,
  })
  .transform(
    (raw): StrategyPerformanceEvent => ({
      kind: "fold",
      navBefore: raw.nav_before,
      round: Number(raw.round),
      sharesMinted: raw.shares_minted,
      strategyId: raw.strategy_id,
    })
  )

const withdrawnSchema = z
  .object({
    nav_before: u64Schema,
    shares_burned: u64Schema,
    strategy_id: addressSchema,
  })
  .transform(
    (raw): StrategyPerformanceEvent => ({
      kind: "withdraw",
      navBefore: raw.nav_before,
      sharesBurned: raw.shares_burned,
      strategyId: raw.strategy_id,
    })
  )

const withdrawalSweptSchema = z
  .object({
    shares_reissued: u64Schema,
    strategy_id: addressSchema,
  })
  .transform(
    (raw): StrategyPerformanceEvent => ({
      kind: "sweep",
      sharesReissued: raw.shares_reissued,
      strategyId: raw.strategy_id,
    })
  )

const roundSettledSchema = z
  .object({
    nav_after_settle: u64Schema,
    round: u64Schema,
    shares_burned: u64Schema,
    strategy_id: addressSchema,
  })
  .transform(
    (raw): StrategyPerformanceEvent => ({
      kind: "settle",
      navAfterSettle: raw.nav_after_settle,
      round: Number(raw.round),
      sharesBurned: raw.shares_burned,
      strategyId: raw.strategy_id,
    })
  )

export function isStrategyPerformanceEventType(eventType: string): boolean {
  const { module, name } = parseEventType(eventType)
  if (module !== STRATEGY_MODULE) {
    return false
  }
  return (
    name === "StrategyDeposited" ||
    name === "DepositsSettled" ||
    name === "StrategyWithdrawn" ||
    name === "RoundSettled" ||
    name === "WithdrawalSwept"
  )
}

export function parseStrategyPerformanceEvent(
  event: CheckpointEvent,
  strategyKind: StrategyPipelineKind
): StrategyPerformanceEvent | null {
  const { name } = parseEventType(event.meta.eventType)

  switch (name) {
    case "StrategyDeposited":
      return depositedSchema.parse(decode(event, depositedStruct))
    case "DepositsSettled":
      return depositsSettledSchema.parse(decode(event, depositsSettledStruct))
    case "StrategyWithdrawn":
      return withdrawnSchema.parse(decode(event, withdrawnStruct))
    case "WithdrawalSwept":
      return withdrawalSweptSchema.parse(decode(event, withdrawalSweptStruct))
    case "RoundSettled":
      return roundSettledSchema.parse(decodeRoundSettled(event, strategyKind))
    default:
      return null
  }
}

export function applyStrategyFold(
  state: StrategyFoldState,
  event: StrategyPerformanceEvent
): StrategyFoldResult {
  let supply = state.supply
  let lastRound = state.lastRound
  let snapshot: StrategySnapshotAnchor | null = null

  switch (event.kind) {
    case "deposit":
      snapshot = anchor(event.kind, event.navBefore, supply)
      supply += event.sharesMinted
      break
    case "fold":
      snapshot = anchor(event.kind, event.navBefore, supply)
      supply += event.sharesMinted
      lastRound = event.round
      break
    case "withdraw":
      snapshot = anchor(event.kind, event.navBefore, supply)
      supply = subtractFloorZero(supply, event.sharesBurned)
      break
    case "settle": {
      const postSupply = subtractFloorZero(supply, event.sharesBurned)
      snapshot = anchor(event.kind, event.navAfterSettle, postSupply)
      supply = postSupply
      lastRound = event.round
      break
    }
    case "sweep":
      supply += event.sharesReissued
      break
  }

  return { snapshot, state: { lastRound, supply } }
}

function decode(event: CheckpointEvent, struct: { parse(bytes: Uint8Array): unknown }): unknown {
  if (event.contents !== null) {
    return struct.parse(event.contents)
  }
  return event.json
}

function decodeRoundSettled(event: CheckpointEvent, strategyKind: StrategyPipelineKind): unknown {
  if (event.contents !== null) {
    return roundSettledStructFor(strategyKind).parse(event.contents)
  }
  return event.json
}

function roundSettledStructFor(strategyKind: StrategyPipelineKind): { parse(bytes: Uint8Array): unknown } {
  switch (strategyKind) {
    case "hedged-plp":
      return hedgedPlpRoundSettledStruct
    case "plp-collar":
      return plpCollarRoundSettledStruct
    case "bullish-upside":
    case "strangle":
      return standardRoundSettledStruct
    case "range-ladder":
      return rangeLadderRoundSettledStruct
  }
}

function anchor(kind: StrategySnapshotKind, nav: bigint, totalShares: bigint): StrategySnapshotAnchor {
  return {
    kind,
    nav,
    sharePrice: sharePrice(nav, totalShares),
    totalShares,
  }
}

function subtractFloorZero(value: bigint, delta: bigint): bigint {
  return delta >= value ? 0n : value - delta
}

function sharePrice(nav: bigint, totalShares: bigint): number {
  if (totalShares <= 0n) {
    return 1
  }
  return Number(nav) / Number(totalShares)
}
