import type { ArenaActivityRow, ArenaCallRow, ArenaCreatorRow } from "../db/schema.ts"
import type { ArenaMetadataContent } from "./metadata.ts"

// View models that mirror web/src/lib/arena/types.ts. The backend derives the
// fields the old on-chain creator profile used to provide (creatorName,
// creatorWinRate, creatorAvatarSeed) from the indexed address + off-chain
// metadata. Market label / fair-up probability are composed from the Predict
// server where available, else derived locally.

export type ArenaCallStatus = "active" | "settled" | "bond_claimed"
export type ArenaDirection = "up" | "down"
export type ArenaDataMode = "live" | "mock"

export interface ArenaCallModel {
  backers: number
  bondPlp: number
  // Chain object ids — needed by the web to build back/fade/claim transactions.
  // `id` is our internal ULID; `callId` is the on-chain Call object.
  callId: string
  // Creator's wallet address — lets the web gate the creator-only "claim bond"
  // action (the contract also enforces it).
  creator: string
  createdAt: string
  creatorAvatarSeed: string
  creatorHandle: string
  creatorName: string
  creatorWinRate: number
  direction: ArenaDirection
  expiryMs: number
  faders: number
  fairUpProbability: number
  id: string
  market: string
  oracleId: string
  predictId: string
  status: ArenaCallStatus
  strikeUsd: number
  winState?: "won" | "lost"
}

export interface ArenaCreatorModel {
  bondPlp: number
  callCount: number
  handle: string
  id: string
  name: string
  settledCount: number
  winCount: number
}

export interface ArenaActivityModel {
  actor: string
  callLabel: string
  id: string
  kind: "launched" | "backed" | "faded" | "claimed" | "reclaimed"
  timestamp: string
}

export interface ArenaSummaryModel {
  activeCalls: number
  bondedPlp: number
  creatorCount: number
  participantCount: number
}

export interface ArenaPageModel {
  activity: ArenaActivityModel[]
  calls: ArenaCallModel[]
  creators: ArenaCreatorModel[]
  dataMode: ArenaDataMode
  summary: ArenaSummaryModel
}

// Optional Predict-server-composed market overlay keyed by predictId.
export interface MarketOverlay {
  fairUpProbability?: number
  label?: string
  strikeUsd?: number
}

// Predict-server-composed oracle settlement state, keyed by oracleId. The
// oracle is the SINGLE source of truth for whether a call has resolved (there
// is no on-chain call-level settle step): a call is "settled" iff its oracle
// has settled. Defaults to not-settled so reads degrade gracefully when the
// Predict server is unavailable.
export interface OracleSettlement {
  // Underlying asset symbol from the oracle (e.g. "BTC"), used to label the
  // market. Optional so reads degrade when the Predict server is unavailable.
  asset?: string
  expiryMs?: number
  settled: boolean
  settlementPrice?: string
}

export interface CreatorStats {
  settledCount: number
  winCount: number
}

// Resolved identity for a creator address, sourced from the `users` table via
// their linked wallets. Username supersedes the content-hash metadata name;
// avatarUrl supersedes the metadata avatar seed when present.
export interface CreatorIdentity {
  avatarUrl?: string | undefined
  displayName?: string | undefined
  username?: string | undefined
}

// Scaling: Move u64 amounts are stored as decimal strings, but two different
// scales are in play. Oracle PRICES (strike, settlement) use 9-decimal
// precision; quote/PLP AMOUNTS (DUSDC, PLP shares) use the quote asset's 6
// decimals. Mixing them misreports a bond by 1000x, so keep them split.
const PRICE_DECIMALS = 1_000_000_000
const QUOTE_DECIMALS = 1_000_000

// Quote/PLP amount (DUSDC supplied, PLP shares minted) -> display number.
export function scaleQuote(raw: string): number {
  return Number(BigInt(raw)) / QUOTE_DECIMALS
}

// Oracle price (strike, settlement price) -> display number.
export function scalePrice(raw: string): number {
  return Number(BigInt(raw)) / PRICE_DECIMALS
}

// USD strike formatter for the default market label (e.g. "$64,303").
const strikeUsdFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
})

export function callStatus(row: ArenaCallRow, oracle: OracleSettlement): ArenaCallStatus {
  if (row.bondClaimed) {
    return "bond_claimed"
  }
  // The oracle is the source of truth: a call is settled iff its oracle has.
  if (oracleSettledForCall(row, oracle)) {
    return "settled"
  }
  return "active"
}

// Each OracleSVI carries a single expiry; when the composed expiry is present,
// require it to match so a mismatched oracle/expiry never flips the status.
function oracleSettledForCall(row: ArenaCallRow, oracle: OracleSettlement): boolean {
  if (!oracle.settled) {
    return false
  }
  if (oracle.expiryMs === undefined) {
    return true
  }
  return oracle.expiryMs === Number(BigInt(row.expiry))
}

// Outcome derived purely from oracle truth + call terms — mirrors the contract
// (up wins when price > strike; down wins when price <= strike). null when the
// oracle has not settled for this call or no settlement price is available.
function deriveWon(row: ArenaCallRow, oracle: OracleSettlement): boolean | null {
  if (!oracleSettledForCall(row, oracle) || oracle.settlementPrice === undefined) {
    return null
  }
  const price = BigInt(oracle.settlementPrice)
  const strike = BigInt(row.strike)
  return row.isUp ? price > strike : price <= strike
}

// Creator win/settled counts, derived at read time from oracle state rather than
// stored — always consistent with the oracle, never double-counted.
export function deriveCreatorStats(
  calls: ArenaCallRow[],
  oracleStates: Map<string, OracleSettlement>
): Map<string, CreatorStats> {
  const stats = new Map<string, CreatorStats>()
  for (const call of calls) {
    const oracle = oracleStates.get(call.oracleId) ?? { settled: false }
    const entry = stats.get(call.creator) ?? { settledCount: 0, winCount: 0 }
    if (oracleSettledForCall(call, oracle)) {
      entry.settledCount += 1
      if (deriveWon(call, oracle) === true) {
        entry.winCount += 1
      }
    }
    stats.set(call.creator, entry)
  }
  return stats
}

export function shortAddress(address: string): string {
  const normalized = address.toLowerCase()
  if (normalized.length <= 10) {
    return normalized
  }
  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`
}

export function winRate(settledCount: number, winCount: number): number {
  if (settledCount <= 0) {
    return 0
  }
  return winCount / settledCount
}

export function toCallModel(
  row: ArenaCallRow,
  creatorStats: CreatorStats,
  overlay: MarketOverlay,
  oracle: OracleSettlement,
  identity: CreatorIdentity = {}
): ArenaCallModel {
  // Username (from the users table) supersedes the short-address fallback for
  // both handle and name; displayName fills the name when no username exists.
  const handle = identity.username ?? shortAddress(row.creator)
  const name = identity.username ?? identity.displayName ?? shortAddress(row.creator)
  const model: ArenaCallModel = {
    backers: row.backers,
    bondPlp: scaleQuote(row.bondPlpAmount),
    callId: row.callId,
    creator: row.creator,
    createdAt: row.createdAtMs,
    creatorAvatarSeed: identity.avatarUrl ?? row.creator,
    creatorHandle: handle,
    creatorName: name,
    creatorWinRate: winRate(creatorStats.settledCount, creatorStats.winCount),
    direction: row.isUp ? "up" : "down",
    expiryMs: Number(BigInt(row.expiry)),
    faders: row.faders,
    fairUpProbability: overlay.fairUpProbability ?? 0,
    id: row.id,
    market: overlay.label ?? defaultMarketLabel(row, oracle.asset),
    oracleId: row.oracleId,
    predictId: row.predictId,
    status: callStatus(row, oracle),
    strikeUsd: overlay.strikeUsd ?? scalePrice(row.strike),
  }
  const won = deriveWon(row, oracle)
  if (won !== null) {
    model.winState = won ? "won" : "lost"
  }
  return model
}

export function toCreatorModel(
  row: ArenaCreatorRow,
  meta: ArenaMetadataContent,
  stats: CreatorStats,
  identity: CreatorIdentity = {}
): ArenaCreatorModel {
  // Username from the users table takes precedence over the content-hash
  // metadata handle/name; both fall back to the short address as before.
  return {
    bondPlp: scaleQuote(row.bondedPlp),
    callCount: row.callCount,
    handle: identity.username ?? meta.handle ?? shortAddress(row.address),
    id: row.id,
    name: identity.username ?? identity.displayName ?? meta.name ?? shortAddress(row.address),
    settledCount: stats.settledCount,
    winCount: stats.winCount,
  }
}

export function toActivityModel(row: ArenaActivityRow): ArenaActivityModel {
  return {
    actor: row.actor,
    callLabel: row.callLabel,
    id: row.id,
    kind: activityKind(row.kind),
    timestamp: row.timestampMs,
  }
}

function activityKind(kind: string): ArenaActivityModel["kind"] {
  if (
    kind === "launched" ||
    kind === "backed" ||
    kind === "faded" ||
    kind === "claimed" ||
    kind === "reclaimed"
  ) {
    return kind
  }
  return "launched"
}

function defaultMarketLabel(row: ArenaCallRow, asset?: string): string {
  const direction = row.isUp ? "Up" : "Down"
  const strike = strikeUsdFormatter.format(scalePrice(row.strike))
  const prefix = asset ? `${asset} ` : ""
  return `${prefix}${direction} @ ${strike}`
}
