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

const ShieldPolicyBcs = bcs.struct("VaultPolicy", {
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

const ShieldVaultBcs = bcs.struct("ShieldVault", {
  id: SuiUidBcs,
  treasury: TreasuryCapBcs,
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

const RangeLadderVaultBcs = bcs.struct("RangeLadderVault", {
  id: SuiUidBcs,
  treasury: TreasuryCapBcs,
  cash: BalanceBcs,
  manager_id: SuiIdBcs,
  active_round: bcs.option(RangeRoundBcs),
  policy: RangeLadderPolicyBcs,
  paused: bcs.Bool,
})

type ShieldVaultBcsValue = ReturnType<typeof ShieldVaultBcs.parse>
type RangeLadderVaultBcsValue = ReturnType<typeof RangeLadderVaultBcs.parse>

export interface ShieldVaultState {
  activeRound: {
    hedgeQuantity: bigint
    oracleId: string
    predictId: string
    settled: boolean
    strike: bigint
  } | null
  cash: bigint
  managerId: string
  nav: bigint
  paused: boolean
  plpAmount: bigint
  plpCostBasis: bigint
  vaultId: string
}

export interface RangeLadderVaultState {
  activeRound: {
    oracleId: string
    positionCount: number
    predictId: string
  } | null
  cash: bigint
  managerId: string
  nav: bigint
  paused: boolean
  vaultId: string
}

function readBigInt(value: string) {
  return BigInt(value)
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

function normalizeShield(value: ShieldVaultBcsValue): ShieldVaultState {
  const cash = readBigInt(value.cash.value)
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
    cash,
    managerId: value.manager_id,
    nav: cash + plpCostBasis,
    paused: value.paused,
    plpAmount: readBigInt(value.plp.value),
    plpCostBasis,
    vaultId: value.id.id,
  }
}

function normalizeRangeLadder(
  value: RangeLadderVaultBcsValue
): RangeLadderVaultState {
  const cash = readBigInt(value.cash.value)
  const round = value.active_round

  return {
    activeRound: round
      ? {
          oracleId: round.oracle_id,
          positionCount: round.positions.length,
          predictId: round.predict_id,
        }
      : null,
    cash,
    managerId: value.manager_id,
    nav: cash,
    paused: value.paused,
    vaultId: value.id.id,
  }
}

export async function readShieldVault(
  client: SuiClient,
  objectId: string
): Promise<ShieldVaultState> {
  return normalizeShield(ShieldVaultBcs.parse(await readBcsObject(client, objectId)))
}

export async function readRangeLadderVault(
  client: SuiClient,
  objectId: string
): Promise<RangeLadderVaultState> {
  return normalizeRangeLadder(
    RangeLadderVaultBcs.parse(await readBcsObject(client, objectId))
  )
}
