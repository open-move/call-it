import { PREDICT_OBJECT_ID, PREDICT_SERVER_URL } from "./config"
import {
  type ManagerPositionSummaryResponse,
  type ManagerSummaryResponse,
  type OracleInfo,
  type OraclePriceUpdate,
  type OracleStateResponse,
  type OracleSviUpdate,
  type PredictManagerEvent,
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

function parsePredictManagerEvent(value: unknown): PredictManagerEvent {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: manager event must be an object"
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
    manager_id: readString(value, "manager_id"),
    owner: readString(value, "owner"),
  }
}

function parsePredictManagerEventArray(value: unknown): PredictManagerEvent[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected manager event array"
    )
  }

  return value.map(parsePredictManagerEvent)
}

function parseManagerBalance(value: unknown) {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: manager balance must be an object"
    )
  }

  return {
    quote_asset: readString(value, "quote_asset"),
    balance: readNumber(value, "balance"),
  }
}

function parseManagerSummary(value: unknown): ManagerSummaryResponse {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: manager summary must be an object"
    )
  }

  const balances = value.balances

  if (!Array.isArray(balances)) {
    throw new PredictServerError(
      "Invalid Predict response: manager balances must be an array"
    )
  }

  return {
    manager_id: readString(value, "manager_id"),
    owner: readString(value, "owner"),
    balances: balances.map(parseManagerBalance),
    trading_balance: readNumber(value, "trading_balance"),
    open_exposure: readNumber(value, "open_exposure"),
    redeemable_value: readNumber(value, "redeemable_value"),
    realized_pnl: readNumber(value, "realized_pnl"),
    unrealized_pnl: readNumber(value, "unrealized_pnl"),
    account_value: readNumber(value, "account_value"),
    open_positions: readNumber(value, "open_positions"),
    awaiting_settlement_positions: readNumber(
      value,
      "awaiting_settlement_positions"
    ),
  }
}

function parseManagerPositionSummary(
  value: unknown
): ManagerPositionSummaryResponse {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: manager position summary must be an object"
    )
  }

  return {
    predict_id: readString(value, "predict_id"),
    manager_id: readString(value, "manager_id"),
    quote_asset: readString(value, "quote_asset"),
    oracle_id: readString(value, "oracle_id"),
    underlying_asset: readString(value, "underlying_asset"),
    expiry: readNumber(value, "expiry"),
    strike: readNumber(value, "strike"),
    is_up: readBoolean(value, "is_up"),
    minted_quantity: readNumber(value, "minted_quantity"),
    redeemed_quantity: readNumber(value, "redeemed_quantity"),
    open_quantity: readNumber(value, "open_quantity"),
    total_cost: readNumber(value, "total_cost"),
    total_payout: readNumber(value, "total_payout"),
    realized_pnl: readNumber(value, "realized_pnl"),
    unrealized_pnl: readNumber(value, "unrealized_pnl"),
    open_cost_basis: readNumber(value, "open_cost_basis"),
    average_entry_price: readNumber(value, "average_entry_price"),
    average_exit_price:
      typeof value.average_exit_price === "number" ? value.average_exit_price : null,
    mark_price: typeof value.mark_price === "number" ? value.mark_price : null,
    mark_value: typeof value.mark_value === "number" ? value.mark_value : null,
    status: readString(value, "status"),
    first_minted_at: readNumber(value, "first_minted_at"),
    last_activity_at: readNumber(value, "last_activity_at"),
  }
}

function parseManagerPositionSummaryArray(
  value: unknown
): ManagerPositionSummaryResponse[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected manager position summary array"
    )
  }

  return value.map(parseManagerPositionSummary)
}

async function readPredictJson<T>(
  path: string,
  parse: (value: unknown) => T
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${PREDICT_SERVER_URL}${path}`, {
      cache: "no-store",
    })
  } catch (error) {
    throw new PredictServerError(
      `Unable to reach Predict server at ${PREDICT_SERVER_URL}`
    )
  }

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

export function getPredictManagers() {
  return readPredictJson("/managers", parsePredictManagerEventArray)
}

export function getManagerSummary(managerId: string) {
  return readPredictJson(
    `/managers/${encodeURIComponent(managerId)}/summary`,
    parseManagerSummary
  )
}

export function getManagerPositionSummaries(managerId: string) {
  return readPredictJson(
    `/managers/${encodeURIComponent(managerId)}/positions/summary`,
    parseManagerPositionSummaryArray
  )
}
