import { bcs } from "@mysten/sui/bcs"
import { type SuiClientTypes } from "@mysten/sui/client"

import {
  PREDICT_PRICE_SCALE,
  PREDICT_QUOTE_ASSET,
  SHIELD_ORIGINAL_PACKAGE_ID,
} from "./config"
import { getSuiGrpcClient } from "./sui-client"

const ID = bcs
  .struct("ID", {
    bytes: bcs.Address,
  })
  .transform({
    output: (value) => value.bytes,
  })

const UID = bcs.struct("UID", {
  id: ID,
})

const Balance = bcs.struct("Balance", {
  value: bcs.U64,
})

const ShieldOwnerCapBcs = bcs.struct("ShieldOwnerCap", {
  id: UID,
  policy_id: ID,
})

const ShieldPolicyBcs = bcs.struct("ShieldPolicy", {
  id: UID,
  beneficiary: bcs.Address,
  deposit_amount: bcs.U64,
  predict_id: ID,
  manager_id: ID,
  oracle_id: ID,
  hedge_expiry_ms: bcs.U64,
  hedge_strike: bcs.U64,
  hedge_quantity: bcs.U64,
  max_loss_bps: bcs.U16,
  hedge_budget_amount: bcs.U64,
  hedge_cost: bcs.U64,
  plp_balance: Balance,
  plp_amount: bcs.U64,
  created_at_ms: bcs.U64,
  settled: bcs.Bool,
})

type ObjectWithContent = SuiClientTypes.Object<{ content: true }>

export interface ShieldPositionRow {
  beneficiary: string
  createdAtMs: number
  depositAmount: bigint
  hedgeBudgetAmount: bigint
  hedgeCost: bigint
  hedgeExpiryMs: number
  hedgeQuantity: bigint
  hedgeStrike: bigint
  hedgeStrikeUsd: number
  managerId: string
  maxLossBps: number
  oracleId: string
  ownerCapId: string
  plpAmount: bigint
  policyId: string
  settled: boolean
}

function getShieldOwnerCapType() {
  return `${SHIELD_ORIGINAL_PACKAGE_ID}::policy::ShieldOwnerCap<${PREDICT_QUOTE_ASSET}>`
}

function readBigInt(value: string) {
  return BigInt(value)
}

function readNumber(value: string) {
  return Number(readBigInt(value))
}

function toUsdPrice(value: bigint) {
  return Number(value) / PREDICT_PRICE_SCALE
}

function isObjectWithContent(
  value: ObjectWithContent | Error
): value is ObjectWithContent {
  return !(value instanceof Error)
}

async function listOwnedShieldCapObjects(owner: string) {
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
        type: getShieldOwnerCapType(),
      })

    objects.push(...page.objects)
    cursor = page.cursor
  } while (cursor)

  return objects
}

export async function getShieldPositions(owner: string) {
  const capObjects = await listOwnedShieldCapObjects(owner)
  const caps = capObjects.flatMap((object) => {
    if (!object.content) {
      return []
    }

    const cap = ShieldOwnerCapBcs.parse(object.content)

    return [
      {
        ownerCapId: object.objectId,
        policyId: cap.policy_id,
      },
    ]
  })

  if (caps.length === 0) {
    return []
  }

  const policies = await getSuiGrpcClient().getObjects({
    include: { content: true },
    objectIds: caps.map((cap) => cap.policyId),
  })
  const positions: ShieldPositionRow[] = []

  policies.objects.forEach((object, index) => {
    if (!isObjectWithContent(object) || !object.content) {
      return
    }

    const cap = caps[index]

    if (!cap) {
      return
    }

    const policy = ShieldPolicyBcs.parse(object.content)
    const hedgeStrike = readBigInt(policy.hedge_strike)

    positions.push({
      beneficiary: policy.beneficiary,
      createdAtMs: readNumber(policy.created_at_ms),
      depositAmount: readBigInt(policy.deposit_amount),
      hedgeBudgetAmount: readBigInt(policy.hedge_budget_amount),
      hedgeCost: readBigInt(policy.hedge_cost),
      hedgeExpiryMs: readNumber(policy.hedge_expiry_ms),
      hedgeQuantity: readBigInt(policy.hedge_quantity),
      hedgeStrike,
      hedgeStrikeUsd: toUsdPrice(hedgeStrike),
      managerId: policy.manager_id,
      maxLossBps: policy.max_loss_bps,
      oracleId: policy.oracle_id,
      ownerCapId: cap.ownerCapId,
      plpAmount: readBigInt(policy.plp_amount),
      policyId: object.objectId,
      settled: policy.settled,
    })
  })

  return positions.sort(
    (firstPosition, secondPosition) =>
      secondPosition.createdAtMs - firstPosition.createdAtMs
  )
}
