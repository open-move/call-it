import { z } from "zod"

import { BASE_VAULT_ID, PREDICT_QUOTE_ASSET } from "@/lib/config"
import { DEPLOYMENT } from "@/lib/deployment"
import type { StrategyRound, StrategyState, StrategyWalletState } from "@/lib/strategies/types"
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
    key,
    managerId: strategy.manager_id,
    nav,
    paused: strategy.paused,
    pendingShares: bigintFrom(raw.pending_shares) ?? 0n,
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
