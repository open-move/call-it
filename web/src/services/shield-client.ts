import { bcs } from "@mysten/sui/bcs"
import type { SuiClientTypes } from "@mysten/sui/client"

import {
  BASE_VAULT_ID,
  PREDICT_QUOTE_ASSET,
  SHIELD_ORIGINAL_PACKAGE_ID,
  SHIELD_SHARE_ASSET,
  SHIELD_STRATEGY_ID,
} from "@/lib/config"
import {
  BalanceBcs,
  MarketKeyBcs,
  SuiIdBcs,
  SuiUidBcs,
  normalizeMarketKey,
  readBcsBigInt,
  readBcsNumber,
  toUsdPrice,
} from "./owned-ticket-bcs"
import { getSuiGrpcClient } from "./sui-client"

const SupplyBcs = bcs.struct("Supply", {
  value: bcs.U64,
})

const TreasuryCapBcs = bcs.struct("TreasuryCap", {
  id: SuiUidBcs,
  total_supply: SupplyBcs,
})

const BaseVaultBcs = bcs.struct("BaseVault", {
  id: SuiUidBcs,
  treasury: TreasuryCapBcs,
  cash: BalanceBcs,
  paused: bcs.Bool,
})

const ShieldStrategyPolicyBcs = bcs.struct("StrategyPolicy", {
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
  policy: ShieldStrategyPolicyBcs,
  paused: bcs.Bool,
})

type ShieldStrategyBcsValue = ReturnType<typeof ShieldStrategyBcs.parse>
type BaseVaultBcsValue = ReturnType<typeof BaseVaultBcs.parse>

const ShieldPolicyBcs = bcs.struct("ShieldPolicy", {
  id: SuiUidBcs,
  predict_id: SuiIdBcs,
  manager_id: SuiIdBcs,
  key: MarketKeyBcs,
  quantity: bcs.U64,
  plp_balance: BalanceBcs,
  created_at_ms: bcs.U64,
})

type ObjectWithContent = SuiClientTypes.Object<{ content: true }>

export interface ShieldPositionRow {
  createdAtMs: number
  hedgeExpiryMs: number
  hedgeQuantity: bigint
  hedgeStrike: bigint
  hedgeStrikeUsd: number
  isUp: boolean
  managerId: string
  oracleId: string
  plpAmount: bigint
  policyId: string
}

export interface ShieldStrategyState {
  activeRound: {
    hedgeQuantity: bigint
    oracleId: string
    predictId: string
    settled: boolean
    strike: bigint
    strikeUsd: number
  } | null
  baseShares: bigint
  baseVaultId: string
  cash: bigint
  managerId: string
  nav: bigint
  paused: boolean
  plpAmount: bigint
  plpCostBasis: bigint
  policy: {
    hedgeBudgetBps: number
    maxHedgeAskBps: bigint
    maxPlpAllocationBps: number
    reserveBps: number
    strikeBandBps: number
  }
  sharePrice: number
  shareSupply: bigint
  strategyId: string
}

export interface ShieldWalletState {
  dusdcBalance: bigint
  shieldShareBalance: bigint
}

function baseValueForShares(base: BaseVaultBcsValue | undefined, shares: bigint) {
  if (shares <= 0n) {
    return 0n
  }

  if (!base) {
    return shares
  }

  const nav = readBcsBigInt(base.cash.value)
  const supply = readBcsBigInt(base.treasury.total_supply.value)

  if (supply <= 0n) {
    throw new Error("Base Vault has shares to value but zero supply")
  }

  return (shares * nav) / supply
}

function normalizeShieldStrategy(
  value: ShieldStrategyBcsValue,
  base?: BaseVaultBcsValue
): ShieldStrategyState {
  const cash = readBcsBigInt(value.cash.value)
  const baseShares = readBcsBigInt(value.base_shares.value)
  const plpCostBasis = readBcsBigInt(value.plp_cost_basis)
  const nav = cash + plpCostBasis + baseValueForShares(base, baseShares)
  const shareSupply = readBcsBigInt(value.treasury.total_supply.value)
  const activeRound = value.active_round

  return {
    activeRound: activeRound
      ? {
          hedgeQuantity: readBcsBigInt(activeRound.hedge_quantity),
          oracleId: activeRound.oracle_id,
          predictId: activeRound.predict_id,
          settled: activeRound.settled,
          strike: readBcsBigInt(activeRound.strike),
          strikeUsd: toUsdPrice(readBcsBigInt(activeRound.strike)),
        }
      : null,
    baseShares,
    baseVaultId: value.base_vault_id,
    cash,
    managerId: value.manager_id,
    nav,
    paused: value.paused,
    plpAmount: readBcsBigInt(value.plp.value),
    plpCostBasis,
    policy: {
      hedgeBudgetBps: value.policy.hedge_budget_bps,
      maxHedgeAskBps: readBcsBigInt(value.policy.max_hedge_ask_bps),
      maxPlpAllocationBps: value.policy.max_plp_allocation_bps,
      reserveBps: value.policy.reserve_bps,
      strikeBandBps: value.policy.strike_band_bps,
    },
    sharePrice: shareSupply > 0n ? Number(nav) / Number(shareSupply) : 1,
    shareSupply,
    strategyId: value.id.id,
  }
}

export async function getShieldStrategyState() {
  if (!SHIELD_STRATEGY_ID) {
    return undefined
  }

  const [strategyObject, baseObject] = await Promise.all([
    getSuiGrpcClient().getObject({
      include: { content: true },
      objectId: SHIELD_STRATEGY_ID,
    }),
    BASE_VAULT_ID
      ? getSuiGrpcClient().getObject({
          include: { content: true },
          objectId: BASE_VAULT_ID,
        })
      : undefined,
  ])
  const content = strategyObject.object.content

  if (!content) {
    throw new Error("Shield strategy object has no readable content")
  }

  return normalizeShieldStrategy(
    ShieldStrategyBcs.parse(content),
    baseObject?.object.content ? BaseVaultBcs.parse(baseObject.object.content) : undefined
  )
}

export async function getShieldWalletState(owner: string) {
  const [dusdcBalance, shieldShareBalance] = await Promise.all([
    getSuiGrpcClient().getBalance({
      coinType: PREDICT_QUOTE_ASSET,
      owner,
    }),
    getSuiGrpcClient().getBalance({
      coinType: SHIELD_SHARE_ASSET,
      owner,
    }),
  ])

  return {
    dusdcBalance: BigInt(dusdcBalance.balance.balance),
    shieldShareBalance: BigInt(shieldShareBalance.balance.balance),
  } satisfies ShieldWalletState
}

function getShieldPolicyType() {
  return `${SHIELD_ORIGINAL_PACKAGE_ID}::policy::ShieldPolicy<${PREDICT_QUOTE_ASSET}>`
}

async function listOwnedShieldPolicyObjects(owner: string) {
  const client = getSuiGrpcClient()
  const objects: ObjectWithContent[] = []
  let cursor: string | null = null

  do {
    const page: SuiClientTypes.ListOwnedObjectsResponse<{ content: true }> =
      await client.listOwnedObjects({
        cursor,
        include: { content: true },
        limit: 50,
        owner,
        type: getShieldPolicyType(),
      })

    objects.push(...page.objects)
    cursor = page.cursor
  } while (cursor)

  return objects
}

export async function getShieldPositions(owner: string) {
  const policyObjects = await listOwnedShieldPolicyObjects(owner)
  const positions: ShieldPositionRow[] = []

  policyObjects.forEach((object) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!object.content) {
      return
    }

    const policy = ShieldPolicyBcs.parse(object.content)
    const marketKey = normalizeMarketKey(policy.key)

    positions.push({
      createdAtMs: readBcsNumber(policy.created_at_ms),
      hedgeExpiryMs: marketKey.expiryMs,
      hedgeQuantity: readBcsBigInt(policy.quantity),
      hedgeStrike: marketKey.strike,
      hedgeStrikeUsd: marketKey.strikeUsd,
      isUp: marketKey.isUp,
      managerId: policy.manager_id,
      oracleId: marketKey.oracleId,
      plpAmount: readBcsBigInt(policy.plp_balance.value),
      policyId: object.objectId,
    })
  })

  return positions.sort(
    (firstPosition, secondPosition) =>
      secondPosition.createdAtMs - firstPosition.createdAtMs
  )
}
