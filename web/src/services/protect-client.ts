import { bcs } from "@mysten/sui/bcs"
import type { SuiClientTypes } from "@mysten/sui/client"

import { PREDICT_QUOTE_ASSET, PROTECT_ORIGINAL_PACKAGE_ID } from "@/lib/config"
import {
  MarketKeyBcs,
  SuiIdBcs,
  SuiUidBcs,
  normalizeMarketKey,
  readBcsBigInt,
  readBcsNumber,
} from "./owned-ticket-bcs"
import { getSuiGrpcClient } from "./sui-client"

const ProtectionPolicyBcs = bcs.struct("ProtectionPolicy", {
  id: SuiUidBcs,
  premium_amount: bcs.U64,
  predict_id: SuiIdBcs,
  manager_id: SuiIdBcs,
  key: MarketKeyBcs,
  quantity: bcs.U64,
  hedge_cost: bcs.U64,
  created_at_ms: bcs.U64,
})

type ObjectWithContent = SuiClientTypes.Object<{ content: true }>

export interface ProtectPositionRow {
  createdAtMs: number
  expiryMs: number
  hedgeCost: bigint
  isUp: boolean
  managerId: string
  oracleId: string
  policyId: string
  premiumAmount: bigint
  quantity: bigint
  triggerStrike: bigint
  triggerStrikeUsd: number
}

function getProtectionPolicyType() {
  return `${PROTECT_ORIGINAL_PACKAGE_ID}::policy::ProtectionPolicy<${PREDICT_QUOTE_ASSET}>`
}

async function listOwnedProtectionPolicyObjects(owner: string) {
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
        type: getProtectionPolicyType(),
      })

    objects.push(...page.objects)
    cursor = page.cursor
  } while (cursor)

  return objects
}

export async function getProtectPositions(owner: string) {
  const policyObjects = await listOwnedProtectionPolicyObjects(owner)
  const positions: ProtectPositionRow[] = []

  policyObjects.forEach((object) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!object.content) {
      return
    }

    const policy = ProtectionPolicyBcs.parse(object.content)
    const marketKey = normalizeMarketKey(policy.key)

    positions.push({
      createdAtMs: readBcsNumber(policy.created_at_ms),
      expiryMs: marketKey.expiryMs,
      hedgeCost: readBcsBigInt(policy.hedge_cost),
      isUp: marketKey.isUp,
      managerId: policy.manager_id,
      oracleId: marketKey.oracleId,
      policyId: object.objectId,
      premiumAmount: readBcsBigInt(policy.premium_amount),
      quantity: readBcsBigInt(policy.quantity),
      triggerStrike: marketKey.strike,
      triggerStrikeUsd: marketKey.strikeUsd,
    })
  })

  return positions.sort(
    (firstPosition, secondPosition) =>
      secondPosition.createdAtMs - firstPosition.createdAtMs
  )
}
