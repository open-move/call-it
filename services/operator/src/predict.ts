import { z } from "zod"

import type { PredictConfig } from "./config.ts"
import { logger, toLogFields } from "./logger.ts"

export type OracleStatus = "active" | "pending" | "settled" | "inactive" | "created"

export interface OracleInfo {
  activatedAt: number | null
  expiryMs: bigint
  minStrike: bigint
  oracleCapId: string
  oracleId: string
  predictId: string
  settlementPrice: bigint | null
  settledAt: number | null
  status: OracleStatus
  tickSize: bigint
  underlyingAsset: string
}

export interface OracleState {
  latestPrice: {
    forward: bigint
    spot: bigint
  } | null
  oracle: OracleInfo
}

export interface RoundOracleSelection {
  fallback: boolean
  oracle: OracleInfo | undefined
}

// === Boundary schemas (Predict REST server JSON) ===

const u64 = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((value) => BigInt(value))

const u64Nullable = z.preprocess(
  (value) => (value === null || value === undefined ? null : value),
  u64.nullable()
)

const numberNullable = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value)
  }
  return value
}, z.number().nullable())

const oracleStatusSchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(["active", "pending", "settled", "inactive", "created"]))

const oracleInfoSchema = z
  .object({
    activated_at: numberNullable,
    expiry: u64,
    min_strike: u64,
    oracle_cap_id: z.string(),
    oracle_id: z.string(),
    predict_id: z.string(),
    settlement_price: u64Nullable,
    settled_at: numberNullable,
    status: oracleStatusSchema,
    tick_size: u64,
    underlying_asset: z.string(),
  })
  .transform(
    (value): OracleInfo => ({
      activatedAt: value.activated_at,
      expiryMs: value.expiry,
      minStrike: value.min_strike,
      oracleCapId: value.oracle_cap_id,
      oracleId: value.oracle_id,
      predictId: value.predict_id,
      settlementPrice: value.settlement_price,
      settledAt: value.settled_at,
      status: value.status,
      tickSize: value.tick_size,
      underlyingAsset: value.underlying_asset,
    })
  )

const oracleStateSchema = z
  .object({
    latest_price: z.object({ forward: u64, spot: u64 }).nullish(),
    oracle: oracleInfoSchema,
  })
  .transform(
    (value): OracleState => ({
      latestPrice: value.latest_price
        ? { forward: value.latest_price.forward, spot: value.latest_price.spot }
        : null,
      oracle: value.oracle,
    })
  )

const oracleListSchema = z.array(oracleInfoSchema)

async function fetchPredictJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Predict server request failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export async function listOracles(config: PredictConfig) {
  const url = `${config.serverUrl}/predicts/${encodeURIComponent(config.sharedObjectId)}/oracles`
  return oracleListSchema.parse(await fetchPredictJson(url))
}

export async function getOracleState(config: PredictConfig, oracleId: string) {
  const url = `${config.serverUrl}/oracles/${encodeURIComponent(oracleId)}/state`
  return oracleStateSchema.parse(await fetchPredictJson(url))
}

export async function findOracle(config: PredictConfig, oracleId: string) {
  const oracles = await listOracles(config)
  return oracles.find((oracle) => oracle.oracleId === oracleId)
}

// === Pure round-oracle selection (testable) ===

export function selectRoundOracleFrom(
  oracles: OracleInfo[],
  nowMs: number,
  config: PredictConfig
): RoundOracleSelection {
  const entryMidpoint = (config.roundEntryMinMsToExpiry + config.roundEntryMaxMsToExpiry) / 2

  const byEntryMidpoint = (left: OracleInfo, right: OracleInfo) => {
    const leftDistance = Math.abs(Number(left.expiryMs) - nowMs - entryMidpoint)
    const rightDistance = Math.abs(Number(right.expiryMs) - nowMs - entryMidpoint)
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance
    }
    return left.expiryMs < right.expiryMs ? -1 : 1
  }

  const isBaseCandidate = (oracle: OracleInfo) => {
    if (oracle.status !== "active") {
      return false
    }
    if (oracle.underlyingAsset !== config.roundUnderlyingAsset) {
      return false
    }
    const msToExpiry = Number(oracle.expiryMs) - nowMs
    return msToExpiry >= config.roundEntryMinMsToExpiry && msToExpiry <= config.roundEntryMaxMsToExpiry
  }

  const isStrictRoundCandidate = (oracle: OracleInfo) => {
    if (!isBaseCandidate(oracle) || oracle.activatedAt === null) {
      return false
    }
    const roundIntervalMs = Number(oracle.expiryMs) - oracle.activatedAt
    return Math.abs(roundIntervalMs - config.roundIntervalMs) <= config.roundIntervalToleranceMs
  }

  const strict = oracles.filter(isStrictRoundCandidate).sort(byEntryMidpoint)
  if (strict[0]) {
    return { fallback: false, oracle: strict[0] }
  }

  const fallback = oracles.filter(isBaseCandidate).sort(byEntryMidpoint)
  return { fallback: true, oracle: fallback[0] }
}

export async function selectRoundOracle(config: PredictConfig) {
  const oracles = await listOracles(config)
  const selection = selectRoundOracleFrom(oracles, Date.now(), config)

  if (selection.oracle && selection.fallback) {
    const intervalMs =
      selection.oracle.activatedAt === null
        ? null
        : Number(selection.oracle.expiryMs) - selection.oracle.activatedAt
    logger.info(
      toLogFields({
        intervalMs,
        msToExpiry: Number(selection.oracle.expiryMs) - Date.now(),
        oracleId: selection.oracle.oracleId,
      }),
      "round oracle fallback selected"
    )
  }

  return selection.oracle
}
