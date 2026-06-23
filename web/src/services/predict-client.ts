import { PREDICT_OBJECT_ID, PREDICT_SERVER_URL } from "@/lib/config"
import { type CacheOptions, TtlCache } from "@/lib/server-cache"
import type {
  DirectionalPositionMintEvent,
  DirectionalPositionRedeemEvent,
  LpSupplyEvent,
  LpWithdrawalEvent,
  ManagerBalance,
  ManagerPositionActivityResponse,
  ManagerPositionSummary,
  ManagerRangeActivityResponse,
  ManagerSummary,
  OracleInfo,
  OraclePriceUpdate,
  OracleStateResponse,
  OracleSviUpdate,
  PredictManagerCreatedEvent,
  RangeMintEvent,
  RangeRedeemEvent,
  VaultPerformancePoint,
  VaultPerformanceResponse,
  VaultSummary,
} from "@/lib/types/predict"

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

function parseManagerBalance(value: unknown): ManagerBalance {
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

function parseManagerSummary(value: unknown): ManagerSummary {
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

function parseManagerPositionActivityResponse(
  value: unknown
): ManagerPositionActivityResponse {
  if (!isRecord(value)) {
    throw new PredictServerError(
      "Invalid Predict response: expected manager position activity"
    )
  }

  return {
    minted: parseDirectionalPositionMintEventArray(value.minted),
    redeemed: parseDirectionalPositionRedeemEventArray(value.redeemed),
  }
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

// Shared cache for read-only Predict stats. Keyed by request path (which
// includes query params), so distinct ranges / limits cache independently.
const predictCache = new TtlCache()

// Cache windows for anonymous, background stats only. Opt-in per call site:
// caching is NEVER the default, so anything that must reflect a user's own
// action (their trade, their LP deposit) or a real-time market signal stays
// live unless a caller explicitly passes a preset. Each entry keeps serving for
// STALE_GRACE_MS past expiry if the Predict server errors.
const STALE_GRACE_MS = 5 * 60_000
export const PREDICT_CACHE = {
  /** Landing-band figures (vault value, active-market count). */
  STATS: { staleMs: STALE_GRACE_MS, ttlMs: 30_000 },
  /** Global "recent volume" / leaderboard aggregates (no oracle filter). */
  ACTIVITY: { staleMs: STALE_GRACE_MS, ttlMs: 60_000 },
} satisfies Record<string, CacheOptions>

async function fetchPredictJson<T>(
  path: string,
  parse: (value: unknown) => T
): Promise<T> {
  const response = await fetch(`${PREDICT_SERVER_URL}${path}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")

    throw new PredictServerError(
      `Predict server request failed: ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`
    )
  }

  return parse(await response.json())
}

/// Read a Predict endpoint. Pass `cache` to serve through the shared TTL cache
/// (deduped + stale-on-error); omit it for always-fresh, per-request reads.
async function readPredictJson<T>(
  path: string,
  parse: (value: unknown) => T,
  cache?: CacheOptions
): Promise<T> {
  if (cache === undefined) {
    return fetchPredictJson(path, parse)
  }

  return predictCache.fetch(path, () => fetchPredictJson(path, parse), cache)
}

// Live by default; pass `cache` only from anonymous background reads (e.g. the
// landing band). Trading surfaces call it without a cache so settlement / new
// markets show promptly.
export function getPredictOracles(cache?: CacheOptions) {
  return readPredictJson(
    `/predicts/${PREDICT_OBJECT_ID}/oracles`,
    parseOracleInfoArray,
    cache
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

// Live by default; the earn page reads it fresh so a just-placed deposit /
// withdrawal is reflected immediately. Pass `cache` only from the landing band.
export function getPredictVaultSummary(cache?: CacheOptions) {
  return readPredictJson(
    `/predicts/${PREDICT_OBJECT_ID}/vault/summary`,
    parseVaultSummary,
    cache
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

  // Only cache the global feed (recent volume / leaderboard). Per-market reads
  // (oracleId set) power live market-detail activity and must stay fresh so a
  // just-placed trade shows up on refresh.
  return readPredictJson(
    `/positions/minted?${params.toString()}`,
    parseDirectionalPositionMintEventArray,
    oracleId ? undefined : PREDICT_CACHE.ACTIVITY
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
    parseDirectionalPositionRedeemEventArray,
    oracleId ? undefined : PREDICT_CACHE.ACTIVITY
  )
}

export function getRangeMints(limit: number, oracleId?: string) {
  const params = new URLSearchParams({ limit: limit.toString() })

  if (oracleId) {
    params.set("oracle_id", oracleId)
  }

  return readPredictJson(
    `/ranges/minted?${params.toString()}`,
    parseRangeMintEventArray,
    oracleId ? undefined : PREDICT_CACHE.ACTIVITY
  )
}

export function getRangeRedeems(limit: number, oracleId?: string) {
  const params = new URLSearchParams({ limit: limit.toString() })

  if (oracleId) {
    params.set("oracle_id", oracleId)
  }

  return readPredictJson(
    `/ranges/redeemed?${params.toString()}`,
    parseRangeRedeemEventArray,
    oracleId ? undefined : PREDICT_CACHE.ACTIVITY
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

export function getManagerPositions(managerId: string) {
  return readPredictJson(
    `/managers/${encodeURIComponent(managerId)}/positions`,
    parseManagerPositionActivityResponse
  )
}

export function getManagerSummary(managerId: string) {
  return readPredictJson(
    `/managers/${encodeURIComponent(managerId)}/summary`,
    parseManagerSummary
  )
}

export function getManagerRanges(managerId: string) {
  return readPredictJson(
    `/managers/${encodeURIComponent(managerId)}/ranges`,
    parseManagerRangeActivityResponse
  )
}
