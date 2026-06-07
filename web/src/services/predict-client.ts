import {
  PREDICT_OBJECT_ID,
  PREDICT_SERVER_URL,
} from "@/lib/config"
import type {DirectionalPositionMintEvent, DirectionalPositionRedeemEvent, LpSupplyEvent, LpWithdrawalEvent, OracleInfo, OraclePriceUpdate, OracleStateResponse, OracleSviUpdate, ManagerPositionSummary, ManagerRangeActivityResponse, PredictManagerCreatedEvent, RangeMintEvent, RangeRedeemEvent, VaultPerformancePoint, VaultPerformanceResponse, VaultSummary} from "@/lib/types/predict";

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

function readNullableString(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (value === null) {
    return null
  }

  if (typeof value !== "string") {
    throw new PredictServerError(
      `Invalid Predict response: ${key} must be a string or null`
    )
  }

  return value
}

function readStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new PredictServerError(
      `Invalid Predict response: ${key} must be a string array`
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

function parseVaultSummary(value: unknown): VaultSummary {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: vault summary must be an object"
    )
  }

  return {
    predict_id: readString(value, "predict_id"),
    quote_assets: readStringArray(value, "quote_assets"),
    vault_balance: readNumber(value, "vault_balance"),
    vault_value: readNumber(value, "vault_value"),
    total_mtm: readNumber(value, "total_mtm"),
    total_max_payout: readNumber(value, "total_max_payout"),
    available_liquidity: readNumber(value, "available_liquidity"),
    available_withdrawal: readNumber(value, "available_withdrawal"),
    plp_total_supply: readNumber(value, "plp_total_supply"),
    plp_share_price: readNumber(value, "plp_share_price"),
    utilization: readNumber(value, "utilization"),
    max_payout_utilization: readNumber(value, "max_payout_utilization"),
    net_deposits: readNumber(value, "net_deposits"),
    total_supplied: readNumber(value, "total_supplied"),
    total_withdrawn: readNumber(value, "total_withdrawn"),
  }
}

function parseVaultPerformancePoint(value: unknown): VaultPerformancePoint {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: vault performance point must be an object"
    )
  }

  return {
    timestamp_ms: readNumber(value, "timestamp_ms"),
    share_price: readNumber(value, "share_price"),
    vault_value: readNumber(value, "vault_value"),
    total_shares: readNumber(value, "total_shares"),
  }
}

function parseVaultPerformanceResponse(
  value: unknown
): VaultPerformanceResponse {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: vault performance must be an object"
    )
  }

  const points = value.points

  if (!Array.isArray(points)) {
    throw new PredictServerError(
      "Invalid Predict response: vault performance points must be an array"
    )
  }

  return {
    predict_id: readString(value, "predict_id"),
    range: readString(value, "range"),
    points: points.map(parseVaultPerformancePoint),
  }
}

function parseDirectionalPositionMintEvent(
  value: unknown
): DirectionalPositionMintEvent {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: directional position mint must be an object"
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
    predict_id: readString(value, "predict_id"),
    manager_id: readString(value, "manager_id"),
    trader: readString(value, "trader"),
    quote_asset: readString(value, "quote_asset"),
    oracle_id: readString(value, "oracle_id"),
    expiry: readNumber(value, "expiry"),
    strike: readNumber(value, "strike"),
    is_up: readBoolean(value, "is_up"),
    quantity: readNumber(value, "quantity"),
    cost: readNumber(value, "cost"),
    ask_price: readNumber(value, "ask_price"),
  }
}

function parseDirectionalPositionRedeemEvent(
  value: unknown
): DirectionalPositionRedeemEvent {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: directional position redeem must be an object"
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
    predict_id: readString(value, "predict_id"),
    manager_id: readString(value, "manager_id"),
    owner: readString(value, "owner"),
    executor: readString(value, "executor"),
    quote_asset: readString(value, "quote_asset"),
    oracle_id: readString(value, "oracle_id"),
    expiry: readNumber(value, "expiry"),
    strike: readNumber(value, "strike"),
    is_up: readBoolean(value, "is_up"),
    quantity: readNumber(value, "quantity"),
    payout: readNumber(value, "payout"),
    bid_price: readNumber(value, "bid_price"),
    is_settled: readBoolean(value, "is_settled"),
  }
}

function parseRangeMintEvent(value: unknown): RangeMintEvent {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: range mint must be an object"
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
    predict_id: readString(value, "predict_id"),
    manager_id: readString(value, "manager_id"),
    trader: readString(value, "trader"),
    quote_asset: readString(value, "quote_asset"),
    oracle_id: readString(value, "oracle_id"),
    expiry: readNumber(value, "expiry"),
    lower_strike: readNumber(value, "lower_strike"),
    higher_strike: readNumber(value, "higher_strike"),
    quantity: readNumber(value, "quantity"),
    cost: readNumber(value, "cost"),
    ask_price: readNumber(value, "ask_price"),
  }
}

function parseRangeRedeemEvent(value: unknown): RangeRedeemEvent {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: range redeem must be an object"
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
    predict_id: readString(value, "predict_id"),
    manager_id: readString(value, "manager_id"),
    trader: readString(value, "trader"),
    quote_asset: readString(value, "quote_asset"),
    oracle_id: readString(value, "oracle_id"),
    expiry: readNumber(value, "expiry"),
    lower_strike: readNumber(value, "lower_strike"),
    higher_strike: readNumber(value, "higher_strike"),
    quantity: readNumber(value, "quantity"),
    payout: readNumber(value, "payout"),
    bid_price: readNumber(value, "bid_price"),
    is_settled: readBoolean(value, "is_settled"),
  }
}

function parseLpSupplyEvent(value: unknown): LpSupplyEvent {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: LP supply must be an object"
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
    predict_id: readString(value, "predict_id"),
    supplier: readString(value, "supplier"),
    quote_asset: readString(value, "quote_asset"),
    amount: readNumber(value, "amount"),
    shares_minted: readNumber(value, "shares_minted"),
  }
}

function parseLpWithdrawalEvent(value: unknown): LpWithdrawalEvent {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: LP withdrawal must be an object"
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
    predict_id: readString(value, "predict_id"),
    withdrawer: readString(value, "withdrawer"),
    quote_asset: readString(value, "quote_asset"),
    amount: readNumber(value, "amount"),
    shares_burned: readNumber(value, "shares_burned"),
  }
}

function parsePredictManagerCreatedEvent(
  value: unknown
): PredictManagerCreatedEvent {
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

function parseManagerPositionSummary(value: unknown): ManagerPositionSummary {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: position summary must be an object"
    )
  }

  return {
    predict_id: readString(value, "predict_id"),
    manager_id: readString(value, "manager_id"),
    quote_asset: readString(value, "quote_asset"),
    oracle_id: readString(value, "oracle_id"),
    underlying_asset: readNullableString(value, "underlying_asset"),
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
    average_entry_price: readNullableNumber(value, "average_entry_price"),
    average_exit_price: readNullableNumber(value, "average_exit_price"),
    mark_price: readNullableNumber(value, "mark_price"),
    mark_value: readNullableNumber(value, "mark_value"),
    status: readString(value, "status"),
    first_minted_at: readNumber(value, "first_minted_at"),
    last_activity_at: readNumber(value, "last_activity_at"),
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

function parseDirectionalPositionMintEventArray(
  value: unknown
): DirectionalPositionMintEvent[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected directional position mint array"
    )
  }

  return value.map(parseDirectionalPositionMintEvent)
}

function parseDirectionalPositionRedeemEventArray(
  value: unknown
): DirectionalPositionRedeemEvent[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected directional position redeem array"
    )
  }

  return value.map(parseDirectionalPositionRedeemEvent)
}

function parseRangeMintEventArray(value: unknown): RangeMintEvent[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected range mint array"
    )
  }

  return value.map(parseRangeMintEvent)
}

function parseRangeRedeemEventArray(value: unknown): RangeRedeemEvent[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected range redeem array"
    )
  }

  return value.map(parseRangeRedeemEvent)
}

function parsePredictManagerCreatedEventArray(
  value: unknown
): PredictManagerCreatedEvent[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected manager event array"
    )
  }

  return value.map(parsePredictManagerCreatedEvent)
}

function parseManagerPositionSummaryArray(
  value: unknown
): ManagerPositionSummary[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected position summary array"
    )
  }

  return value.map(parseManagerPositionSummary)
}

function parseManagerRangeActivityResponse(
  value: unknown
): ManagerRangeActivityResponse {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected manager range activity"
    )
  }

  return {
    minted: parseRangeMintEventArray(value.minted),
    redeemed: parseRangeRedeemEventArray(value.redeemed),
  }
}

function parseLpSupplyEventArray(value: unknown): LpSupplyEvent[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected LP supply array"
    )
  }

  return value.map(parseLpSupplyEvent)
}

function parseLpWithdrawalEventArray(value: unknown): LpWithdrawalEvent[] {
  if (!Array.isArray(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected LP withdrawal array"
    )
  }

  return value.map(parseLpWithdrawalEvent)
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

export function getPredictVaultSummary() {
  return readPredictJson(
    `/predicts/${PREDICT_OBJECT_ID}/vault/summary`,
    parseVaultSummary
  )
}

export function getPredictVaultPerformance(range = "ALL") {
  const params = new URLSearchParams({ range })

  return readPredictJson(
    `/predicts/${PREDICT_OBJECT_ID}/vault/performance?${params.toString()}`,
    parseVaultPerformanceResponse
  )
}

export function getDirectionalPositionMints(limit: number, oracleId?: string) {
  const params = new URLSearchParams({ limit: limit.toString() })

  if (oracleId) {
    params.set("oracle_id", oracleId)
  }

  return readPredictJson(
    `/positions/minted?${params.toString()}`,
    parseDirectionalPositionMintEventArray
  )
}

export function getDirectionalPositionRedeems(
  limit: number,
  oracleId?: string
) {
  const params = new URLSearchParams({ limit: limit.toString() })

  if (oracleId) {
    params.set("oracle_id", oracleId)
  }

  return readPredictJson(
    `/positions/redeemed?${params.toString()}`,
    parseDirectionalPositionRedeemEventArray
  )
}

export function getRangeMints(limit: number, oracleId?: string) {
  const params = new URLSearchParams({ limit: limit.toString() })

  if (oracleId) {
    params.set("oracle_id", oracleId)
  }

  return readPredictJson(
    `/ranges/minted?${params.toString()}`,
    parseRangeMintEventArray
  )
}

export function getRangeRedeems(limit: number, oracleId?: string) {
  const params = new URLSearchParams({ limit: limit.toString() })

  if (oracleId) {
    params.set("oracle_id", oracleId)
  }

  return readPredictJson(
    `/ranges/redeemed?${params.toString()}`,
    parseRangeRedeemEventArray
  )
}

export function getLpSupplies(limit: number) {
  const params = new URLSearchParams({ limit: limit.toString() })

  return readPredictJson(
    `/lp/supplies?${params.toString()}`,
    parseLpSupplyEventArray
  )
}

export function getLpWithdrawals(limit: number) {
  const params = new URLSearchParams({ limit: limit.toString() })

  return readPredictJson(
    `/lp/withdrawals?${params.toString()}`,
    parseLpWithdrawalEventArray
  )
}

export function getPredictManagers(owner?: string) {
  const params = new URLSearchParams()

  if (owner) {
    params.set("owner", owner)
  }

  const query = params.toString()

  return readPredictJson(
    `/managers${query ? `?${query}` : ""}`,
    parsePredictManagerCreatedEventArray
  )
}

export function getManagerPositionSummaries(managerId: string) {
  return readPredictJson(
    `/managers/${encodeURIComponent(managerId)}/positions/summary`,
    parseManagerPositionSummaryArray
  )
}

export function getManagerRanges(managerId: string) {
  return readPredictJson(
    `/managers/${encodeURIComponent(managerId)}/ranges`,
    parseManagerRangeActivityResponse
  )
}
