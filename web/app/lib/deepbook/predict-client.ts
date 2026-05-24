import { PREDICT_OBJECT_ID, PREDICT_SERVER_URL } from "./config"
import {
  type OracleInfo,
  type OraclePriceUpdate,
  type OracleStateResponse,
  type OracleSviUpdate,
} from "./predict-types"

export class PredictServerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PredictServerError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (typeof value !== "string") {
    throw new PredictServerError(
      `Invalid Predict response: ${key} must be a string`
    )
  }

  return value
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (typeof value !== "number") {
    throw new PredictServerError(
      `Invalid Predict response: ${key} must be a number`
    )
  }

  return value
}

function readBoolean(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (typeof value !== "boolean") {
    throw new PredictServerError(
      `Invalid Predict response: ${key} must be a boolean`
    )
  }

  return value
}

function readNullableNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (value === null) {
    return null
  }

  if (typeof value !== "number") {
    throw new PredictServerError(
      `Invalid Predict response: ${key} must be a number or null`
    )
  }

  return value
}

function parseOracleInfo(value: unknown): OracleInfo {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: oracle must be an object"
    )
  }

  return {
    predict_id: readString(value, "predict_id"),
    oracle_id: readString(value, "oracle_id"),
    oracle_cap_id: readString(value, "oracle_cap_id"),
    underlying_asset: readString(value, "underlying_asset"),
    expiry: readNumber(value, "expiry"),
    min_strike: readNumber(value, "min_strike"),
    tick_size: readNumber(value, "tick_size"),
    status: readString(value, "status"),
    activated_at: readNullableNumber(value, "activated_at"),
    settlement_price: readNullableNumber(value, "settlement_price"),
    settled_at: readNullableNumber(value, "settled_at"),
    created_checkpoint: readNumber(value, "created_checkpoint"),
  }
}

function parseOraclePriceUpdate(value: unknown): OraclePriceUpdate {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: price update must be an object"
    )
  }

  return {
    event_digest: readString(value, "event_digest"),
    digest: readString(value, "digest"),
    sender: readString(value, "sender"),
    checkpoint: readNumber(value, "checkpoint"),
    checkpoint_timestamp_ms: readNumber(value, "checkpoint_timestamp_ms"),
    tx_index: readNumber(value, "tx_index"),
    event_index: readNumber(value, "event_index"),
    package: readString(value, "package"),
    oracle_id: readString(value, "oracle_id"),
    spot: readNumber(value, "spot"),
    forward: readNumber(value, "forward"),
    onchain_timestamp: readNumber(value, "onchain_timestamp"),
  }
}

function parseNullableOraclePriceUpdate(value: unknown) {
  return value === null ? null : parseOraclePriceUpdate(value)
}

function parseOracleSviUpdate(value: unknown): OracleSviUpdate {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: SVI update must be an object"
    )
  }

  return {
    event_digest: readString(value, "event_digest"),
    digest: readString(value, "digest"),
    sender: readString(value, "sender"),
    checkpoint: readNumber(value, "checkpoint"),
    checkpoint_timestamp_ms: readNumber(value, "checkpoint_timestamp_ms"),
    tx_index: readNumber(value, "tx_index"),
    event_index: readNumber(value, "event_index"),
    package: readString(value, "package"),
    oracle_id: readString(value, "oracle_id"),
    a: readNumber(value, "a"),
    b: readNumber(value, "b"),
    rho: readNumber(value, "rho"),
    rho_negative: readBoolean(value, "rho_negative"),
    m: readNumber(value, "m"),
    m_negative: readBoolean(value, "m_negative"),
    sigma: readNumber(value, "sigma"),
    onchain_timestamp: readNumber(value, "onchain_timestamp"),
  }
}

function parseNullableOracleSviUpdate(value: unknown) {
  return value === null ? null : parseOracleSviUpdate(value)
}

function parseOracleStateResponse(value: unknown): OracleStateResponse {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: oracle state must be an object"
    )
  }

  return {
    oracle: parseOracleInfo(value.oracle),
    latest_price: parseNullableOraclePriceUpdate(value.latest_price),
    latest_svi: parseNullableOracleSviUpdate(value.latest_svi),
    ask_bounds: value.ask_bounds ?? null,
  }
}

function parseOracleInfoArray(value: unknown): OracleInfo[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected oracle array"
    )
  }

  return value.map(parseOracleInfo)
}

function parseOraclePriceUpdateArray(value: unknown): OraclePriceUpdate[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected price update array"
    )
  }

  return value.map(parseOraclePriceUpdate)
}

async function readPredictJson<T>(
  path: string,
  parse: (value: unknown) => T
): Promise<T> {
  const response = await fetch(`${PREDICT_SERVER_URL}${path}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new PredictServerError(
      `Predict server request failed: ${response.status} ${response.statusText}`
    )
  }

  return parse(await response.json())
}

export function getPredictOracles() {
  return readPredictJson(
    `/predicts/${PREDICT_OBJECT_ID}/oracles`,
    parseOracleInfoArray
  )
}

export function getOracleState(oracleId: string) {
  return readPredictJson(
    `/oracles/${encodeURIComponent(oracleId)}/state`,
    parseOracleStateResponse
  )
}

export function getOraclePrices(oracleId: string, limit: number) {
  const params = new URLSearchParams({ limit: limit.toString() })
  return readPredictJson(
    `/oracles/${encodeURIComponent(oracleId)}/prices?${params.toString()}`,
    parseOraclePriceUpdateArray
  )
}
