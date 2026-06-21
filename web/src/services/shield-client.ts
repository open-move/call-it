import { bcs } from "@mysten/sui/bcs"
import type { SuiClientTypes } from "@mysten/sui/client"

import { PREDICT_QUOTE_ASSET, SHIELD_ORIGINAL_PACKAGE_ID } from "@/lib/config"
import {
  BalanceBcs,
  MarketKeyBcs,
  SuiIdBcs,
  SuiUidBcs,
  normalizeMarketKey,
  readBcsBigInt,
  readBcsNumber,
} from "./owned-ticket-bcs"
import { getSuiGrpcClient } from "./sui-client"

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
