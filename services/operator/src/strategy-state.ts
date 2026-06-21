import type { SuiClient } from "./sui.ts"

// The strategy/base-vault structs carry a `WithdrawalQueue` (holding Sui
// `Table`s) and other fields whose exact byte layout is awkward to model, so we
// read gRPC `json` mode and pick fields by name instead of by BCS offset. In
// json mode Move `Balance<T>` flattens to a bare u64 string and `Supply`
// renders as `{ value }`. The redeployed vaults hold no bare `cash`: deployable
// value lives as `base_shares` in the Base Vault (+ PLP for hedged_plp).

export interface HedgedPlpStrategyState {
  activeRound: {
    hedgeQuantity: bigint
    oracleId: string
    predictId: string
    strike: bigint
  } | null
  baseShares: bigint
  baseVaultId: string
  managerId: string
  nav: bigint
  paused: boolean
  plpAmount: bigint
  plpCostBasis: bigint
  strategyId: string
}

export interface RangeLadderStrategyState {
  activeRound: {
    oracleId: string
    positionCount: number
    predictId: string
  } | null
  baseShares: bigint
  baseVaultId: string
  managerId: string
  nav: bigint
  paused: boolean
  strategyId: string
}

interface BaseVaultRead {
  cash: bigint
  supply: bigint
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/** Coerce a json scalar (bare u64 string/number) or a `{ value }` wrapper to a bigint. */
function bigintFrom(value: unknown): bigint {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value)
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value)
  }
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return bigintFrom((value as Record<string, unknown>).value)
  }
  return 0n
}

function baseValueForShares(shares: bigint, base: BaseVaultRead | undefined): bigint {
  if (shares <= 0n) {
    return 0n
  }
  if (!base || base.supply <= 0n) {
    return shares
  }
  return (shares * base.cash) / base.supply
}

async function readJson(client: SuiClient, objectId: string): Promise<Record<string, unknown>> {
  const object = await client.getObject({ objectId, include: { json: true } })
  const json = object.object.json

  if (!json) {
    throw new Error(`Object ${objectId} has no readable json content`)
  }

  return asRecord(json)
}

async function readBaseVault(
  client: SuiClient,
  baseVaultId: string | undefined
): Promise<BaseVaultRead | undefined> {
  if (!baseVaultId) {
    return undefined
  }
  const json = await readJson(client, baseVaultId)
  return {
    cash: bigintFrom(json.cash),
    supply: bigintFrom(asRecord(asRecord(json.treasury).total_supply).value),
  }
}

export async function readHedgedPlpStrategy(
  client: SuiClient,
  objectId: string,
  baseVaultId?: string
): Promise<HedgedPlpStrategyState> {
  const [json, base] = await Promise.all([
    readJson(client, objectId),
    readBaseVault(client, baseVaultId),
  ])

  const baseShares = bigintFrom(json.base_shares)
  const plpCostBasis = bigintFrom(json.plp_cost_basis)
  const round = json.active_round ? asRecord(json.active_round) : null

  return {
    activeRound: round
      ? {
          hedgeQuantity: bigintFrom(round.hedge_quantity),
          oracleId: readString(round.oracle_id),
          predictId: readString(round.predict_id),
          strike: bigintFrom(round.strike),
        }
      : null,
    baseShares,
    baseVaultId: readString(json.base_vault_id),
    managerId: readString(json.manager_id),
    nav: plpCostBasis + baseValueForShares(baseShares, base),
    paused: json.paused === true,
    plpAmount: bigintFrom(json.plp),
    plpCostBasis,
    strategyId: objectId,
  }
}

/// Shared, shape-tolerant view used by the strategies whose only operator-facing
/// needs are NAV, the active-round oracle, and the validation ids. Works for
/// single, dual, and PLP-bearing vaults alike: `plp_cost_basis` is absent (→ 0)
/// for vaults that hold no PLP, so NAV collapses to the base-share value.
export interface StrategyState {
  activeRound: {
    oracleId: string
    predictId: string
  } | null
  baseShares: bigint
  baseVaultId: string
  managerId: string
  nav: bigint
  paused: boolean
  plpAmount: bigint
  plpCostBasis: bigint
  strategyId: string
}

export async function readStrategyState(
  client: SuiClient,
  objectId: string,
  baseVaultId?: string
): Promise<StrategyState> {
  const [json, base] = await Promise.all([
    readJson(client, objectId),
    readBaseVault(client, baseVaultId),
  ])

  const baseShares = bigintFrom(json.base_shares)
  const plpCostBasis = bigintFrom(json.plp_cost_basis)
  const round = json.active_round ? asRecord(json.active_round) : null

  return {
    activeRound: round
      ? {
          oracleId: readString(round.oracle_id),
          predictId: readString(round.predict_id),
        }
      : null,
    baseShares,
    baseVaultId: readString(json.base_vault_id),
    managerId: readString(json.manager_id),
    nav: plpCostBasis + baseValueForShares(baseShares, base),
    paused: json.paused === true,
    plpAmount: bigintFrom(json.plp),
    plpCostBasis,
    strategyId: objectId,
  }
}

export async function readRangeLadderStrategy(
  client: SuiClient,
  objectId: string,
  baseVaultId?: string
): Promise<RangeLadderStrategyState> {
  const [json, base] = await Promise.all([
    readJson(client, objectId),
    readBaseVault(client, baseVaultId),
  ])

  const baseShares = bigintFrom(json.base_shares)
  const round = json.active_round ? asRecord(json.active_round) : null
  const positions = round?.positions

  return {
    activeRound: round
      ? {
          oracleId: readString(round.oracle_id),
          positionCount: Array.isArray(positions) ? positions.length : 0,
          predictId: readString(round.predict_id),
        }
      : null,
    baseShares,
    baseVaultId: readString(json.base_vault_id),
    managerId: readString(json.manager_id),
    nav: baseValueForShares(baseShares, base),
    paused: json.paused === true,
    strategyId: objectId,
  }
}
