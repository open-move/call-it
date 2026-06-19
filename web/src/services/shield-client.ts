import { bcs } from "@mysten/sui/bcs"
import type { SuiClientTypes } from "@mysten/sui/client"

import {
  PREDICT_QUOTE_ASSET,
  SHIELD_ORIGINAL_PACKAGE_ID,
  SHIELD_SHARE_ASSET,
  SHIELD_VAULT_ID,
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

const ShieldVaultPolicyBcs = bcs.struct("VaultPolicy", {
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
  policy: ShieldVaultPolicyBcs,
  paused: bcs.Bool,
})

type ShieldVaultBcsValue = ReturnType<typeof ShieldVaultBcs.parse>

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

export interface ShieldVaultState {
  activeRound: {
    hedgeQuantity: bigint
    oracleId: string
    predictId: string
    settled: boolean
    strike: bigint
    strikeUsd: number
  } | null
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
  vaultId: string
}

export interface ShieldWalletState {
  dusdcBalance: bigint
  shieldShareBalance: bigint
}

function normalizeShieldVault(value: ShieldVaultBcsValue): ShieldVaultState {
  const cash = readBcsBigInt(value.cash.value)
  const plpCostBasis = readBcsBigInt(value.plp_cost_basis)
  const nav = cash + plpCostBasis
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
    vaultId: value.id.id,
  }
}

export async function getShieldVaultState() {
  if (!SHIELD_VAULT_ID) {
    return undefined
  }

  const object = await getSuiGrpcClient().getObject({
    include: { content: true },
    objectId: SHIELD_VAULT_ID,
  })
  const content = object.object.content

  if (!content) {
    throw new Error("Shield vault object has no readable content")
  }

  return normalizeShieldVault(ShieldVaultBcs.parse(content))
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
