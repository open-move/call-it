import { bcs } from "@mysten/sui/bcs"
import { deriveDynamicFieldID } from "@mysten/sui/utils"
import { z } from "zod"

import { BASE_VAULT_ID, PREDICT_QUOTE_ASSET } from "@/lib/config"
import { DEPLOYMENT } from "@/lib/deployment"
import type {
  PendingDepositPosition,
  PendingWithdrawalPosition,
  StrategyPosition,
  StrategyRound,
  StrategyState,
  StrategyWalletState,
} from "@/lib/strategies/types"
import { getShareCoinType, type StrategyKey } from "@/services/strategy-transactions"
import { getSuiGrpcClient } from "./sui-client"

// gRPC `json` mode flattens Move `Balance<T>` to its bare u64 string and renders
// `Supply` as `{ value }`. Strategy structs differ across vaults (plp only on
// hedged-plp/plp-collar; round/policy shapes vary), so parse the common fields
// strictly and keep round/policy as tolerant records.
const u64 = z.coerce.bigint()

const supplySchema = z.object({ total_supply: z.object({ value: u64 }) })

// The vault holds capital as base-vault shares (+ PLP for hedged-plp/plp-collar),
// not bare cash. Queue fields (reserved_base_shares, pending_shares,
// stale_withdrawal_grace_rounds) shapes vary, so they're read leniently below.
const strategyJsonSchema = z.object({
  base_vault_id: z.string(),
  manager_id: z.string(),
  base_shares: u64,
  plp: u64.optional(),
  plp_cost_basis: u64.optional(),
  treasury: supplySchema,
  paused: z.boolean(),
  active_round: z.record(z.string(), z.unknown()).nullable(),
  policy: z.record(z.string(), z.unknown()),
})

const baseVaultJsonSchema = z.object({
  cash: u64,
  treasury: supplySchema,
})

function bigintFrom(value: unknown): bigint | null {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value)
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value)
  }
  return null
}

function parseRound(raw: Record<string, unknown> | null): StrategyRound | null {
  if (!raw) {
    return null
  }
  const positions = raw.positions
  const positionCount = Array.isArray(positions)
    ? positions.length
    : (() => {
        const count = bigintFrom(raw.position_count)
        return count === null ? null : Number(count)
      })()

  return {
    oracleId: typeof raw.oracle_id === "string" ? raw.oracle_id : "",
    predictId: typeof raw.predict_id === "string" ? raw.predict_id : "",
    strike: bigintFrom(raw.strike),
    quantity: bigintFrom(raw.hedge_quantity ?? raw.quantity),
    downStrike: bigintFrom(raw.down_strike),
    upStrike: bigintFrom(raw.up_strike),
    downQuantity: bigintFrom(raw.down_quantity),
    upQuantity: bigintFrom(raw.up_quantity),
    positionCount,
  }
}

function parsePolicy(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw)) {
    const asBigint = bigintFrom(value)
    if (asBigint !== null) {
      out[key] = Number(asBigint)
    } else if (typeof value === "number") {
      out[key] = value
    }
  }
  return out
}

function baseValueForShares(shares: bigint, baseNav: bigint, baseSupply: bigint): bigint {
  if (shares <= 0n) {
    return 0n
  }
  if (baseSupply <= 0n) {
    return shares
  }
  return (shares * baseNav) / baseSupply
}

export async function getStrategyState(key: StrategyKey): Promise<StrategyState | undefined> {
  const deployment = DEPLOYMENT.strategies[key]
  const baseVaultId = DEPLOYMENT.baseVault.vaultId || BASE_VAULT_ID
  if (!deployment.strategyId) {
    return undefined
  }

  const client = getSuiGrpcClient()
  const [strategyObject, baseObject] = await Promise.all([
    client.getObject({ include: { json: true }, objectId: deployment.strategyId }),
    client.getObject({ include: { json: true }, objectId: baseVaultId }),
  ])

  const raw = (strategyObject.object.json ?? {}) as Record<string, unknown>
  const strategy = strategyJsonSchema.parse(strategyObject.object.json)
  const base = baseVaultJsonSchema.parse(baseObject.object.json)

  const plpCostBasis = strategy.plp_cost_basis ?? null
  const nav =
    (plpCostBasis ?? 0n) +
    baseValueForShares(strategy.base_shares, base.cash, base.treasury.total_supply.value)
  const shareSupply = strategy.treasury.total_supply.value

  return {
    baseShares: strategy.base_shares,
    baseVaultId,
    depositRound: extractQueue(raw, "deposit_queue").currentRound,
    key,
    managerId: strategy.manager_id,
    nav,
    paused: strategy.paused,
    pendingDepositsTotal: bigintFrom(raw.pending_deposits) ?? 0n,
    pendingShares: bigintFrom(raw.pending_shares) ?? 0n,
    pendingSharePool: bigintFrom(raw.pending_share_pool) ?? 0n,
    plpAmount: strategy.plp ?? null,
    plpCostBasis,
    policy: parsePolicy(strategy.policy),
    reservedBaseShares: bigintFrom(raw.reserved_base_shares) ?? 0n,
    round: parseRound(strategy.active_round),
    sharePrice: shareSupply > 0n ? Number(nav) / Number(shareSupply) : 1,
    shareSupply,
    staleGraceRounds: Number(bigintFrom(raw.stale_withdrawal_grace_rounds) ?? 0n),
    strategyId: deployment.strategyId,
  }
}

// gRPC json renders a Move `Table`/`UID` as a nested object eventually bottoming
// out in the object-id string. Walk `.id` until we hit the address.
function extractObjectId(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("0x")) {
    return value
  }
  if (value && typeof value === "object") {
    return extractObjectId((value as Record<string, unknown>).id)
  }
  return null
}

// A queue blob (deposit_queue or the withdrawal `queue`) exposes its current
// round and its `pending` Table id; we read per-user entries off that table.
function extractQueue(
  raw: Record<string, unknown>,
  field: string
): { tableId: string | null; currentRound: number } {
  const blob = raw[field]
  if (!blob || typeof blob !== "object") {
    return { currentRound: 0, tableId: null }
  }
  const record = blob as Record<string, unknown>
  return {
    currentRound: Number(bigintFrom(record.current_round) ?? 0n),
    tableId: extractObjectId(record.pending),
  }
}

// Read a user's entry from a queue's `pending` Table<address, _> via the derived
// dynamic-field id. Best-effort: any failure (not deployed, shape drift) -> null.
async function readQueueEntry(
  tableId: string | null,
  owner: string
): Promise<Record<string, unknown> | null> {
  if (!tableId) {
    return null
  }
  try {
    const fieldId = deriveDynamicFieldID(
      tableId,
      { address: null },
      bcs.Address.serialize(owner).toBytes()
    )
    const object = await getSuiGrpcClient().getObject({
      include: { json: true },
      objectId: fieldId,
    })
    const json = object.object?.json as Record<string, unknown> | undefined
    const value = json?.value
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * A wallet's full position in a strategy: liquid shares plus any in-flight
 * deposit/withdrawal sitting in the round queues. The per-user queue reads are
 * best-effort and degrade to `null` (the UI then shows actions without the
 * in-flight detail).
 */
export async function getStrategyPosition(
  key: StrategyKey,
  owner: string
): Promise<StrategyPosition> {
  const deployment = DEPLOYMENT.strategies[key]
  const client = getSuiGrpcClient()

  const activeSharesPromise = client
    .getBalance({ coinType: getShareCoinType(key), owner })
    .then((result) => BigInt(result.balance.balance))
    .catch(() => 0n)

  let pendingDeposit: PendingDepositPosition | null = null
  let pendingWithdrawal: PendingWithdrawalPosition | null = null

  if (deployment.strategyId) {
    try {
      const strategyObject = await client.getObject({
        include: { json: true },
        objectId: deployment.strategyId,
      })
      const raw = (strategyObject.object?.json ?? {}) as Record<string, unknown>
      const depositQueue = extractQueue(raw, "deposit_queue")
      const withdrawalQueue = extractQueue(raw, "queue")

      const [depositEntry, withdrawalEntry] = await Promise.all([
        readQueueEntry(depositQueue.tableId, owner),
        readQueueEntry(withdrawalQueue.tableId, owner),
      ])

      if (depositEntry) {
        const amount = bigintFrom(depositEntry.amount) ?? 0n
        const round = Number(bigintFrom(depositEntry.round_id) ?? 0n)
        if (amount > 0n) {
          pendingDeposit = {
            amount,
            isRefund: false,
            round,
            settled: round < depositQueue.currentRound,
          }
        }
      }

      if (withdrawalEntry) {
        const shares = bigintFrom(withdrawalEntry.shares) ?? 0n
        const round = Number(bigintFrom(withdrawalEntry.round_id) ?? 0n)
        if (shares > 0n) {
          pendingWithdrawal = {
            round,
            settled: round < withdrawalQueue.currentRound,
            shares,
          }
        }
      }
    } catch {
      // Best-effort: leave pending positions null.
    }
  }

  return {
    activeShares: await activeSharesPromise,
    pendingDeposit,
    pendingWithdrawal,
  }
}

export async function getStrategyWalletState(
  key: StrategyKey,
  owner: string
): Promise<StrategyWalletState> {
  const client = getSuiGrpcClient()
  const [dusdc, share] = await Promise.all([
    client.getBalance({ coinType: PREDICT_QUOTE_ASSET, owner }),
    client.getBalance({ coinType: getShareCoinType(key), owner }),
  ])

  return {
    dusdcBalance: BigInt(dusdc.balance.balance),
    shareBalance: BigInt(share.balance.balance),
  }
}
