import type { PredictConfig } from "./config.ts"

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
    normalized === "created" ||
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

export async function selectRoundOracle(config: PredictConfig) {
  const now = Date.now()
  const entryMidpoint =
    (config.roundEntryMinMsToExpiry + config.roundEntryMaxMsToExpiry) / 2
  const oracles = await listOracles(config)
  const byEntryMidpoint = (left: OracleInfo, right: OracleInfo) => {
    const leftDistance = Math.abs(Number(left.expiryMs) - now - entryMidpoint)
    const rightDistance = Math.abs(Number(right.expiryMs) - now - entryMidpoint)

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

    const msToExpiry = Number(oracle.expiryMs) - now

    return (
      msToExpiry >= config.roundEntryMinMsToExpiry &&
      msToExpiry <= config.roundEntryMaxMsToExpiry
    )
  }
  const isStrictRoundCandidate = (oracle: OracleInfo) => {
    if (!isBaseCandidate(oracle) || oracle.activatedAt === null) {
      return false
    }

    const roundIntervalMs = Number(oracle.expiryMs) - oracle.activatedAt

    return (
      Math.abs(roundIntervalMs - config.roundIntervalMs) <=
      config.roundIntervalToleranceMs
    )
  }
  const strict = oracles.filter(isStrictRoundCandidate).sort(byEntryMidpoint)

  if (strict[0]) {
    return strict[0]
  }

  const fallback = oracles.filter(isBaseCandidate).sort(byEntryMidpoint)

  if (fallback[0]) {
    const intervalMs =
      fallback[0].activatedAt === null
        ? "unknown"
        : String(Number(fallback[0].expiryMs) - fallback[0].activatedAt)
    const msToExpiry = Number(fallback[0].expiryMs) - now

    console.log(
      `[predict] round oracle fallback selected oracle=${fallback[0].oracleId} intervalMs=${intervalMs} msToExpiry=${msToExpiry}`
    )
  }

  return fallback[0]
}
