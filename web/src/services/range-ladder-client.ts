import { bcs } from "@mysten/sui/bcs"
import type { SuiClientTypes } from "@mysten/sui/client"

import {
  PREDICT_QUOTE_ASSET,
  RANGE_LADDER_ORIGINAL_PACKAGE_ID,
} from "@/lib/config"
import {
  RangeKeyBcs,
  SuiIdBcs,
  SuiUidBcs,
  normalizeRangeKey,
  readBcsBigInt,
  readBcsNumber,
} from "./owned-ticket-bcs"
import { getSuiGrpcClient } from "./sui-client"

const RangePositionBcs = bcs.struct("RangePosition", {
  key: RangeKeyBcs,
  quantity: bcs.U64,
  cost: bcs.U64,
})

const RangeLadderPolicyBcs = bcs.struct("RangeLadderPolicy", {
  id: SuiUidBcs,
  premium_amount: bcs.U64,
  predict_id: SuiIdBcs,
  manager_id: SuiIdBcs,
  positions: bcs.vector(RangePositionBcs),
  total_cost: bcs.U64,
  created_at_ms: bcs.U64,
})

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

    const policy = RangeLadderPolicyBcs.parse(object.content)
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
