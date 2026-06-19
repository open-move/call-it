import type { PredictConfig } from "./config.ts"

export type OracleStatus = "active" | "pending" | "settled" | "inactive"

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (typeof value !== "string") {
    throw new Error(`Invalid Predict response: ${key} must be a string`)
  }

  return value
}

function readNullableNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === "number") {
    return value
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value)
  }

  throw new Error(`Invalid Predict response: ${key} must be number or null`)
}

function readBigInt(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (typeof value === "bigint") {
    return value
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value))
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value)
  }

  throw new Error(`Invalid Predict response: ${key} must be an integer`)
}

function readNullableBigInt(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (value === null || value === undefined) {
    return null
  }

  return readBigInt(record, key)
}

function normalizeStatus(value: string): OracleStatus {
  const normalized = value.toLowerCase()

  if (
    normalized === "active" ||
    normalized === "pending" ||
    normalized === "settled" ||
    normalized === "inactive"
  ) {
    return normalized
  }

  throw new Error(`Invalid oracle status ${value}`)
}

function parseOracleInfo(value: unknown): OracleInfo {
  if (!isRecord(value)) {
    throw new Error("Invalid Predict response: oracle must be an object")
  }

  return {
    activatedAt: readNullableNumber(value, "activated_at"),
    expiryMs: readBigInt(value, "expiry"),
    minStrike: readBigInt(value, "min_strike"),
    oracleCapId: readString(value, "oracle_cap_id"),
    oracleId: readString(value, "oracle_id"),
    predictId: readString(value, "predict_id"),
    settlementPrice: readNullableBigInt(value, "settlement_price"),
    settledAt: readNullableNumber(value, "settled_at"),
    status: normalizeStatus(readString(value, "status")),
    tickSize: readBigInt(value, "tick_size"),
    underlyingAsset: readString(value, "underlying_asset"),
  }
}

function parseOracleState(value: unknown): OracleState {
  if (!isRecord(value)) {
    throw new Error("Invalid Predict response: oracle state must be an object")
  }

  const latestPrice = value.latest_price

  return {
    latestPrice: isRecord(latestPrice)
      ? {
          forward: readBigInt(latestPrice, "forward"),
          spot: readBigInt(latestPrice, "spot"),
        }
      : null,
    oracle: parseOracleInfo(value.oracle),
  }
}

async function readPredictJson<T>(url: string, parse: (value: unknown) => T) {
  const response = await fetch(url, { cache: "no-store" })

  if (!response.ok) {
    throw new Error(`Predict server request failed: ${response.status} ${response.statusText}`)
  }

  return parse(await response.json())
}

export function listOracles(config: PredictConfig) {
  return readPredictJson(
    `${config.serverUrl}/predicts/${encodeURIComponent(config.sharedObjectId)}/oracles`,
    (value) => {
      if (!Array.isArray(value)) {
        throw new Error("Invalid Predict response: oracles must be an array")
      }

      return value.map(parseOracleInfo)
    }
  )
}

export function getOracleState(config: PredictConfig, oracleId: string) {
  return readPredictJson(
    `${config.serverUrl}/oracles/${encodeURIComponent(oracleId)}/state`,
    parseOracleState
  )
}

export async function findOracle(config: PredictConfig, oracleId: string) {
  const oracles = await listOracles(config)

  return oracles.find((oracle) => oracle.oracleId === oracleId)
}

export async function soonestEligibleOracle(
  config: PredictConfig,
  minHorizonMs: number
) {
  const floor = BigInt(Date.now() + minHorizonMs)
  const oracles = await listOracles(config)
  const eligible = oracles
    .filter(
      (oracle) => oracle.status === "active" && oracle.expiryMs >= floor
    )
    .sort((left, right) => (left.expiryMs < right.expiryMs ? -1 : 1))

  return eligible[0]
}
