import { bcs } from "@mysten/sui/bcs"
import type { SuiClientTypes } from "@mysten/sui/client"

import {
  PREDICT_QUOTE_ASSET,
  RANGE_LADDER_ORIGINAL_PACKAGE_ID,
  RANGE_LADDER_SHARE_ASSET,
  RANGE_LADDER_VAULT_ID,
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

const RangeLadderVaultPolicyBcs = bcs.struct("RangeLadderPolicy", {
  premium_budget_bps: bcs.U16,
  reserve_bps: bcs.U16,
  max_range_ask_bps: bcs.U64,
  max_rung_count: bcs.U64,
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
  policy: RangeLadderVaultPolicyBcs,
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

type RangeLadderVaultBcsValue = ReturnType<typeof RangeLadderVaultBcs.parse>

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

export interface RangeLadderVaultState {
  activeRound: {
    oracleId: string
    positionCount: number
    positions: RangeLadderPositionRow[]
    predictId: string
    totalCost: bigint
    totalQuantity: bigint
  } | null
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
  vaultId: string
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

function normalizeRangeLadderVault(
  value: RangeLadderVaultBcsValue
): RangeLadderVaultState {
  const cash = readBcsBigInt(value.cash.value)
  const shareSupply = readBcsBigInt(value.treasury.total_supply.value)
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
    cash,
    managerId: value.manager_id,
    nav: cash,
    paused: value.paused,
    policy: {
      maxRangeAskBps: readBcsBigInt(value.policy.max_range_ask_bps),
      maxRungCount: readBcsBigInt(value.policy.max_rung_count),
      premiumBudgetBps: value.policy.premium_budget_bps,
      reserveBps: value.policy.reserve_bps,
    },
    sharePrice: shareSupply > 0n ? Number(cash) / Number(shareSupply) : 1,
    shareSupply,
    vaultId: value.id.id,
  }
}

export async function getRangeLadderVaultState() {
  if (!RANGE_LADDER_VAULT_ID) {
    return undefined
  }

  const object = await getSuiGrpcClient().getObject({
    include: { content: true },
    objectId: RANGE_LADDER_VAULT_ID,
  })
  const content = object.object.content

  if (!content) {
    throw new Error("Range Ladder vault object has no readable content")
  }

  return normalizeRangeLadderVault(RangeLadderVaultBcs.parse(content))
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
