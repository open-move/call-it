import { bcs } from "@mysten/sui/bcs"

import type { SuiClient } from "./sui.ts"

const SuiIdBcs = bcs
  .struct("ID", {
    bytes: bcs.Address,
  })
  .transform({
    output: (value) => value.bytes,
  })

const SuiUidBcs = bcs.struct("UID", {
  id: SuiIdBcs,
})

const BalanceBcs = bcs.struct("Balance", {
  value: bcs.U64,
})

const SupplyBcs = bcs.struct("Supply", {
  value: bcs.U64,
})

const TreasuryCapBcs = bcs.struct("TreasuryCap", {
  id: SuiUidBcs,
  total_supply: SupplyBcs,
})

const ShieldPolicyBcs = bcs.struct("StrategyPolicy", {
  hedge_budget_bps: bcs.U16,
  strike_band_bps: bcs.U16,
  reserve_bps: bcs.U16,
  max_plp_allocation_bps: bcs.U16,
  max_hedge_ask_bps: bcs.U64,
})

const ShieldRoundBcs = bcs.struct("ShieldRound", {
  predict_id: SuiIdBcs,
  oracle_id: SuiIdBcs,
  strike: bcs.U64,
  hedge_quantity: bcs.U64,
  settled: bcs.Bool,
})

const ShieldStrategyBcs = bcs.struct("ShieldStrategy", {
  id: SuiUidBcs,
  treasury: TreasuryCapBcs,
  base_vault_id: SuiIdBcs,
  base_shares: BalanceBcs,
  cash: BalanceBcs,
  plp: BalanceBcs,
  plp_cost_basis: bcs.U64,
  manager_id: SuiIdBcs,
  active_round: bcs.option(ShieldRoundBcs),
  policy: ShieldPolicyBcs,
  paused: bcs.Bool,
})

const RangeLadderPolicyBcs = bcs.struct("RangeLadderPolicy", {
  premium_budget_bps: bcs.U16,
  reserve_bps: bcs.U16,
  max_range_ask_bps: bcs.U64,
  max_rung_count: bcs.U64,
})

const RangeKeyBcs = bcs.struct("RangeKey", {
  oracle_id: SuiIdBcs,
  expiry: bcs.U64,
  lower_strike: bcs.U64,
  higher_strike: bcs.U64,
})

const RangePositionBcs = bcs.struct("RangePosition", {
  key: RangeKeyBcs,
  quantity: bcs.U64,
  cost: bcs.U64,
})

const RangeRoundBcs = bcs.struct("RangeRound", {
  predict_id: SuiIdBcs,
  oracle_id: SuiIdBcs,
  positions: bcs.vector(RangePositionBcs),
})

const RangeLadderStrategyBcs = bcs.struct("RangeLadderStrategy", {
  id: SuiUidBcs,
  treasury: TreasuryCapBcs,
  base_vault_id: SuiIdBcs,
  base_shares: BalanceBcs,
  cash: BalanceBcs,
  manager_id: SuiIdBcs,
  active_round: bcs.option(RangeRoundBcs),
  policy: RangeLadderPolicyBcs,
  paused: bcs.Bool,
})

const BaseVaultBcs = bcs.struct("BaseVault", {
  id: SuiUidBcs,
  treasury: TreasuryCapBcs,
  cash: BalanceBcs,
  paused: bcs.Bool,
})

type ShieldStrategyBcsValue = ReturnType<typeof ShieldStrategyBcs.parse>
type RangeLadderStrategyBcsValue = ReturnType<typeof RangeLadderStrategyBcs.parse>
type BaseVaultBcsValue = ReturnType<typeof BaseVaultBcs.parse>

export interface ShieldStrategyState {
  activeRound: {
    hedgeQuantity: bigint
    oracleId: string
    predictId: string
    settled: boolean
    strike: bigint
  } | null
  baseShares: bigint
  baseVaultId: string
  cash: bigint
  managerId: string
  nav: bigint
  paused: boolean
  plpAmount: bigint
  plpCostBasis: bigint
  strategyId: string
}

export interface RangeLadderStrategyState {
  activeRound: {
    oracleId: string
    positionCount: number
    predictId: string
  } | null
  baseShares: bigint
  baseVaultId: string
  cash: bigint
  managerId: string
  nav: bigint
  paused: boolean
  strategyId: string
}

function readBigInt(value: string) {
  return BigInt(value)
}

function baseValueForShares(base: BaseVaultBcsValue | undefined, shares: bigint) {
  if (shares <= 0n) {
    return 0n
  }

  if (!base) {
    return shares
  }

  const nav = readBigInt(base.cash.value)
  const supply = readBigInt(base.treasury.total_supply.value)

  if (supply <= 0n) {
    throw new Error("Base Vault has shares to value but zero supply")
  }

  return (shares * nav) / supply
}

async function readBcsObject(client: SuiClient, objectId: string) {
  const object = await client.getObject({
    objectId,
    include: { content: true },
  })
  const content = object.object.content

  if (!content) {
    throw new Error(`Object ${objectId} has no readable content`)
  }

  return content
}

function normalizeShield(
  value: ShieldStrategyBcsValue,
  base?: BaseVaultBcsValue
): ShieldStrategyState {
  const cash = readBigInt(value.cash.value)
  const baseShares = readBigInt(value.base_shares.value)
  const plpCostBasis = readBigInt(value.plp_cost_basis)
  const round = value.active_round

  return {
    activeRound: round
      ? {
          hedgeQuantity: readBigInt(round.hedge_quantity),
          oracleId: round.oracle_id,
          predictId: round.predict_id,
          settled: round.settled,
          strike: readBigInt(round.strike),
      }
      : null,
    baseShares,
    baseVaultId: value.base_vault_id,
    cash,
    managerId: value.manager_id,
    nav: cash + plpCostBasis + baseValueForShares(base, baseShares),
    paused: value.paused,
    plpAmount: readBigInt(value.plp.value),
    plpCostBasis,
    strategyId: value.id.id,
  }
}

function normalizeRangeLadder(
  value: RangeLadderStrategyBcsValue,
  base?: BaseVaultBcsValue
): RangeLadderStrategyState {
  const cash = readBigInt(value.cash.value)
  const baseShares = readBigInt(value.base_shares.value)
  const round = value.active_round

  return {
    activeRound: round
      ? {
          oracleId: round.oracle_id,
          positionCount: round.positions.length,
          predictId: round.predict_id,
      }
      : null,
    baseShares,
    baseVaultId: value.base_vault_id,
    cash,
    managerId: value.manager_id,
    nav: cash + baseValueForShares(base, baseShares),
    paused: value.paused,
    strategyId: value.id.id,
  }
}

export async function readShieldStrategy(
  client: SuiClient,
  objectId: string,
  baseVaultId?: string
): Promise<ShieldStrategyState> {
  const [strategyObject, baseObject] = await Promise.all([
    readBcsObject(client, objectId),
    baseVaultId ? readBcsObject(client, baseVaultId) : undefined,
  ])

  return normalizeShield(
    ShieldStrategyBcs.parse(strategyObject),
    baseObject ? BaseVaultBcs.parse(baseObject) : undefined
  )
}

export async function readRangeLadderStrategy(
  client: SuiClient,
  objectId: string,
  baseVaultId?: string
): Promise<RangeLadderStrategyState> {
  const [strategyObject, baseObject] = await Promise.all([
    readBcsObject(client, objectId),
    baseVaultId ? readBcsObject(client, baseVaultId) : undefined,
  ])

  return normalizeRangeLadder(
    RangeLadderStrategyBcs.parse(strategyObject),
    baseObject ? BaseVaultBcs.parse(baseObject) : undefined
  )
}
