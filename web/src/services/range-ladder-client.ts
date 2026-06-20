import { bcs } from "@mysten/sui/bcs"
import type { SuiClientTypes } from "@mysten/sui/client"

import {
  BASE_VAULT_ID,
  PREDICT_QUOTE_ASSET,
  RANGE_LADDER_ORIGINAL_PACKAGE_ID,
  RANGE_LADDER_SHARE_ASSET,
  RANGE_LADDER_STRATEGY_ID,
} from "@/lib/config"
import {
  BalanceBcs,
  RangeKeyBcs,
  SuiIdBcs,
  SuiUidBcs,
  normalizeRangeKey,
  readBcsBigInt,
  readBcsNumber,
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

const RangeLadderStrategyPolicyBcs = bcs.struct("Policy", {
  premium_budget_bps: bcs.U16,
  reserve_bps: bcs.U16,
  max_range_ask_bps: bcs.U64,
  max_rung_count: bcs.U64,
})

const RangePositionBcs = bcs.struct("Position", {
  key: RangeKeyBcs,
  quantity: bcs.U64,
  cost: bcs.U64,
})

const RangeRoundBcs = bcs.struct("Round", {
  predict_id: SuiIdBcs,
  oracle_id: SuiIdBcs,
  positions: bcs.vector(RangePositionBcs),
})

const RangeLadderStrategyBcs = bcs.struct("Strategy", {
  id: SuiUidBcs,
  treasury: TreasuryCapBcs,
  base_vault_id: SuiIdBcs,
  base_shares: BalanceBcs,
  cash: BalanceBcs,
  manager_id: SuiIdBcs,
  active_round: bcs.option(RangeRoundBcs),
  policy: RangeLadderStrategyPolicyBcs,
  paused: bcs.Bool,
})

const RangeLadderTicketPolicyBcs = bcs.struct("RangeLadderPolicy", {
  id: SuiUidBcs,
  premium_amount: bcs.U64,
  predict_id: SuiIdBcs,
  manager_id: SuiIdBcs,
  positions: bcs.vector(RangePositionBcs),
  total_cost: bcs.U64,
  created_at_ms: bcs.U64,
})

type RangeLadderStrategyBcsValue = ReturnType<
  typeof RangeLadderStrategyBcs.parse
>
type BaseVaultBcsValue = ReturnType<typeof BaseVaultBcs.parse>

type ObjectWithContent = SuiClientTypes.Object<{ content: true }>

export interface RangeLadderPositionRow {
  cost: bigint
  expiryMs: number
  higherStrike: bigint
  higherStrikeUsd: number
  lowerStrike: bigint
  lowerStrikeUsd: number
  oracleId: string
  quantity: bigint
}

export interface RangeLadderPolicyRow {
  createdAtMs: number
  managerId: string
  oracleId?: string
  policyId: string
  positions: RangeLadderPositionRow[]
  premiumAmount: bigint
  totalCost: bigint
}

export interface RangeLadderStrategyState {
  activeRound: {
    oracleId: string
    positionCount: number
    positions: RangeLadderPositionRow[]
    predictId: string
    totalCost: bigint
    totalQuantity: bigint
  } | null
  baseShares: bigint
  baseVaultId: string
  cash: bigint
  managerId: string
  nav: bigint
  paused: boolean
  policy: {
    maxRangeAskBps: bigint
    maxRungCount: bigint
    premiumBudgetBps: number
    reserveBps: number
  }
  sharePrice: number
  shareSupply: bigint
  strategyId: string
}

export interface RangeLadderWalletState {
  dusdcBalance: bigint
  rangeShareBalance: bigint
}

function normalizeRangePosition(
  position: ReturnType<typeof RangePositionBcs.parse>
) {
  const rangeKey = normalizeRangeKey(position.key)

  return {
    cost: readBcsBigInt(position.cost),
    expiryMs: rangeKey.expiryMs,
    higherStrike: rangeKey.higherStrike,
    higherStrikeUsd: rangeKey.higherStrikeUsd,
    lowerStrike: rangeKey.lowerStrike,
    lowerStrikeUsd: rangeKey.lowerStrikeUsd,
    oracleId: rangeKey.oracleId,
    quantity: readBcsBigInt(position.quantity),
  } satisfies RangeLadderPositionRow
}

function baseValueForShares(
  base: BaseVaultBcsValue | undefined,
  shares: bigint
) {
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

function normalizeRangeLadderStrategy(
  value: RangeLadderStrategyBcsValue,
  base?: BaseVaultBcsValue
): RangeLadderStrategyState {
  const cash = readBcsBigInt(value.cash.value)
  const baseShares = readBcsBigInt(value.base_shares.value)
  const shareSupply = readBcsBigInt(value.treasury.total_supply.value)
  const nav = cash + baseValueForShares(base, baseShares)
  const activeRound = value.active_round

  return {
    activeRound: activeRound
      ? (() => {
          const positions = activeRound.positions.map(normalizeRangePosition)

          return {
            oracleId: activeRound.oracle_id,
            positionCount: positions.length,
            positions,
            predictId: activeRound.predict_id,
            totalCost: positions.reduce(
              (total, position) => total + position.cost,
              0n
            ),
            totalQuantity: positions.reduce(
              (total, position) => total + position.quantity,
              0n
            ),
          }
        })()
      : null,
    baseShares,
    baseVaultId: value.base_vault_id,
    cash,
    managerId: value.manager_id,
    nav,
    paused: value.paused,
    policy: {
      maxRangeAskBps: readBcsBigInt(value.policy.max_range_ask_bps),
      maxRungCount: readBcsBigInt(value.policy.max_rung_count),
      premiumBudgetBps: value.policy.premium_budget_bps,
      reserveBps: value.policy.reserve_bps,
    },
    sharePrice: shareSupply > 0n ? Number(nav) / Number(shareSupply) : 1,
    shareSupply,
    strategyId: value.id.id,
  }
}

export async function getRangeLadderStrategyState() {
  const strategyId: string = RANGE_LADDER_STRATEGY_ID
  const baseVaultId: string = BASE_VAULT_ID

  if (!strategyId) {
    return undefined
  }

  const [strategyObject, baseObject] = await Promise.all([
    getSuiGrpcClient().getObject({
      include: { content: true },
      objectId: strategyId,
    }),
    baseVaultId
      ? getSuiGrpcClient().getObject({
          include: { content: true },
          objectId: baseVaultId,
        })
      : undefined,
  ])
  const content = strategyObject.object.content

  return normalizeRangeLadderStrategy(
    RangeLadderStrategyBcs.parse(content),
    baseObject?.object.content
      ? BaseVaultBcs.parse(baseObject.object.content)
      : undefined
  )
}

export async function getRangeLadderWalletState(owner: string) {
  const [dusdcBalance, rangeShareBalance] = await Promise.all([
    getSuiGrpcClient().getBalance({
      coinType: PREDICT_QUOTE_ASSET,
      owner,
    }),
    getSuiGrpcClient().getBalance({
      coinType: RANGE_LADDER_SHARE_ASSET,
      owner,
    }),
  ])

  return {
    dusdcBalance: BigInt(dusdcBalance.balance.balance),
    rangeShareBalance: BigInt(rangeShareBalance.balance.balance),
  } satisfies RangeLadderWalletState
}

function getRangeLadderPolicyType() {
  return `${RANGE_LADDER_ORIGINAL_PACKAGE_ID}::policy::RangeLadderPolicy<${PREDICT_QUOTE_ASSET}>`
}

async function listOwnedRangeLadderPolicyObjects(owner: string) {
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
        type: getRangeLadderPolicyType(),
      })

    objects.push(...page.objects)
    cursor = page.cursor
  } while (cursor)

  return objects
}

export async function getRangeLadderPolicies(owner: string) {
  const policyObjects = await listOwnedRangeLadderPolicyObjects(owner)
  const policies: RangeLadderPolicyRow[] = []

  policyObjects.forEach((object) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!object.content) {
      return
    }

    const policy = RangeLadderTicketPolicyBcs.parse(object.content)
    const positions = policy.positions.map((position) => {
      const rangeKey = normalizeRangeKey(position.key)

      return {
        cost: readBcsBigInt(position.cost),
        expiryMs: rangeKey.expiryMs,
        higherStrike: rangeKey.higherStrike,
        higherStrikeUsd: rangeKey.higherStrikeUsd,
        lowerStrike: rangeKey.lowerStrike,
        lowerStrikeUsd: rangeKey.lowerStrikeUsd,
        oracleId: rangeKey.oracleId,
        quantity: readBcsBigInt(position.quantity),
      }
    })

    policies.push({
      createdAtMs: readBcsNumber(policy.created_at_ms),
      managerId: policy.manager_id,
      oracleId: positions[0]?.oracleId,
      policyId: object.objectId,
      positions,
      premiumAmount: readBcsBigInt(policy.premium_amount),
      totalCost: readBcsBigInt(policy.total_cost),
    })
  })

  return policies.sort(
    (firstPolicy, secondPolicy) =>
      secondPolicy.createdAtMs - firstPolicy.createdAtMs
  )
}
