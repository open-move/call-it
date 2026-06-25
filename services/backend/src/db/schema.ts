import { bigint, boolean, doublePrecision, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import type { InferSelectModel } from "drizzle-orm"

// NOTE on u64 storage: Move u64 max (2^64-1) exceeds Postgres bigint
// (signed 2^63-1). All Move u64 values are stored as `text` decimal strings to
// avoid overflow. Millisecond timestamps and counts that originate off-chain
// (and stay within safe ranges) use bigint/integer.

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export const ingestCursors = pgTable("ingest_cursors", {
  // Last fully-committed checkpoint sequence number for this pipeline. The next
  // run resumes from checkpoint + 1 (backfilling any gap on demand).
  checkpoint: bigint("checkpoint", { mode: "bigint" }).notNull(),
  pipeline: text("pipeline").primaryKey(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
})

export const rawEvents = pgTable(
  "raw_events",
  {
    checkpoint: bigint("checkpoint", { mode: "number" }).notNull(),
    checkpointTimestampMs: bigint("checkpoint_timestamp_ms", { mode: "number" }).notNull(),
    contents: text("contents"),
    digest: text("digest").notNull(),
    eventId: text("event_id").primaryKey(),
    eventIndex: integer("event_index").notNull(),
    eventType: text("event_type").notNull(),
    insertedAt: bigint("inserted_at", { mode: "number" }).notNull(),
    json: text("json"),
    module: text("module").notNull(),
    packageId: text("package_id").notNull(),
    sender: text("sender").notNull(),
    txIndex: integer("tx_index").notNull(),
  },
  (table) => ({
    checkpointIdx: index("raw_events_checkpoint_idx").on(table.checkpoint),
    packageIdx: index("raw_events_package_idx").on(table.packageId),
  })
)

export const metadata = pgTable("metadata", {
  contentJson: text("content_json").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  hash: text("hash").primaryKey(),
})

export const strategyFoldState = pgTable("strategy_fold_state", {
  lastRound: integer("last_round"),
  strategyId: text("strategy_id").primaryKey(),
  supply: text("supply").notNull(),
  updatedCheckpoint: bigint("updated_checkpoint", { mode: "number" }).notNull(),
})

export const strategyPerfSnapshots = pgTable(
  "strategy_perf_snapshot",
  {
    checkpoint: bigint("checkpoint", { mode: "number" }).notNull(),
    eventSeq: integer("event_seq").notNull(),
    kind: text("kind").notNull(),
    nav: text("nav").notNull(),
    sharePrice: doublePrecision("share_price").notNull(),
    strategyId: text("strategy_id").notNull(),
    timestampMs: bigint("timestamp_ms", { mode: "number" }).notNull(),
    totalShares: text("total_shares").notNull(),
    txDigest: text("tx_digest").notNull(),
  },
  (table) => ({
    strategyTimestampIdx: index("strategy_perf_strategy_timestamp_idx").on(table.strategyId, table.timestampMs),
    txEventUnique: uniqueIndex("strategy_perf_tx_event_unique").on(table.txDigest, table.eventSeq),
  })
)

// ---------------------------------------------------------------------------
// Identity (Dynamic -> backend user + linked wallets)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  avatarUrl: text("avatar_url"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  displayName: text("display_name"),
  dynamicUserId: text("dynamic_user_id").notNull().unique(),
  email: text("email").unique(),
  id: text("id").primaryKey(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  username: text("username").unique(),
})

export const wallets = pgTable(
  "wallets",
  {
    address: text("address").notNull().unique(),
    chain: text("chain").notNull(),
    id: text("id").primaryKey(),
    isPrimary: boolean("is_primary").notNull().default(false),
    linkedAt: bigint("linked_at", { mode: "number" }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => ({
    userIdx: index("wallets_user_idx").on(table.userId),
  })
)

// ---------------------------------------------------------------------------
// Arena raw event tables (one per event type: EventMeta header + fields)
// ---------------------------------------------------------------------------

export const arenaCallLaunchedEvents = pgTable("arena_call_launched_events", {
  arenaId: text("arena_id").notNull(),
  bondPlpAmount: text("bond_plp_amount").notNull(),
  callId: text("call_id").notNull(),
  checkpoint: bigint("checkpoint", { mode: "number" }).notNull(),
  createdAtMs: text("created_at_ms").notNull(),
  creator: text("creator").notNull(),
  digest: text("digest").notNull(),
  eventId: text("event_id").primaryKey(),
  eventIndex: integer("event_index").notNull(),
  expiry: text("expiry").notNull(),
  isUp: boolean("is_up").notNull(),
  oracleId: text("oracle_id").notNull(),
  predictId: text("predict_id").notNull(),
  strike: text("strike").notNull(),
})

export const arenaCallBackedEvents = pgTable("arena_call_backed_events", {
  callId: text("call_id").notNull(),
  checkpoint: bigint("checkpoint", { mode: "number" }).notNull(),
  cost: text("cost").notNull(),
  digest: text("digest").notNull(),
  eventId: text("event_id").primaryKey(),
  eventIndex: integer("event_index").notNull(),
  managerId: text("manager_id").notNull(),
  participant: text("participant").notNull(),
  quantity: text("quantity").notNull(),
  recordedAtMs: text("recorded_at_ms").notNull(),
  refundAmount: text("refund_amount").notNull(),
})

export const arenaCallFadedEvents = pgTable("arena_call_faded_events", {
  callId: text("call_id").notNull(),
  checkpoint: bigint("checkpoint", { mode: "number" }).notNull(),
  cost: text("cost").notNull(),
  digest: text("digest").notNull(),
  eventId: text("event_id").primaryKey(),
  eventIndex: integer("event_index").notNull(),
  managerId: text("manager_id").notNull(),
  participant: text("participant").notNull(),
  quantity: text("quantity").notNull(),
  recordedAtMs: text("recorded_at_ms").notNull(),
  refundAmount: text("refund_amount").notNull(),
})

export const arenaBondClaimedEvents = pgTable("arena_bond_claimed_events", {
  bondPlpAmount: text("bond_plp_amount").notNull(),
  callId: text("call_id").notNull(),
  checkpoint: bigint("checkpoint", { mode: "number" }).notNull(),
  claimedAtMs: text("claimed_at_ms").notNull(),
  digest: text("digest").notNull(),
  eventId: text("event_id").primaryKey(),
  eventIndex: integer("event_index").notNull(),
  oracleId: text("oracle_id").notNull(),
})

export const arenaBondReclaimedEvents = pgTable("arena_bond_reclaimed_events", {
  bondPlpAmount: text("bond_plp_amount").notNull(),
  callId: text("call_id").notNull(),
  checkpoint: bigint("checkpoint", { mode: "number" }).notNull(),
  digest: text("digest").notNull(),
  eventId: text("event_id").primaryKey(),
  eventIndex: integer("event_index").notNull(),
  reclaimedAtMs: text("reclaimed_at_ms").notNull(),
})

// ---------------------------------------------------------------------------
// Arena projection tables
// ---------------------------------------------------------------------------

export const arenaCalls = pgTable(
  "arena_calls",
  {
    backers: integer("backers").notNull().default(0),
    bondPlpAmount: text("bond_plp_amount").notNull(),
    bondClaimed: boolean("bond_claimed").notNull().default(false),
    callId: text("call_id").notNull().unique(),
    createdAtMs: text("created_at_ms").notNull(),
    creator: text("creator").notNull(),
    expiry: text("expiry").notNull(),
    faders: integer("faders").notNull().default(0),
    id: text("id").primaryKey(),
    isUp: boolean("is_up").notNull(),
    oracleId: text("oracle_id").notNull(),
    predictId: text("predict_id").notNull(),
    strike: text("strike").notNull(),
  },
  (table) => ({
    creatorIdx: index("arena_calls_creator_idx").on(table.creator),
  })
)

export const arenaParticipations = pgTable(
  "arena_participations",
  {
    callId: text("call_id").notNull(),
    cost: text("cost").notNull(),
    eventId: text("event_id").notNull().unique(),
    id: text("id").primaryKey(),
    participant: text("participant").notNull(),
    quantity: text("quantity").notNull(),
    recordedAtMs: text("recorded_at_ms").notNull(),
    side: text("side").notNull(),
  },
  (table) => ({
    callIdx: index("arena_participations_call_idx").on(table.callId),
    participantIdx: index("arena_participations_participant_idx").on(table.participant),
  })
)

export const arenaCreators = pgTable("arena_creators", {
  address: text("address").notNull().unique(),
  bondedPlp: text("bonded_plp").notNull().default("0"),
  callCount: integer("call_count").notNull().default(0),
  id: text("id").primaryKey(),
})

export const arenaActivity = pgTable(
  "arena_activity",
  {
    actor: text("actor").notNull(),
    callId: text("call_id").notNull(),
    callLabel: text("call_label").notNull(),
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().unique(),
    kind: text("kind").notNull(),
    timestampMs: text("timestamp_ms").notNull(),
  },
  (table) => ({
    callIdx: index("arena_activity_call_idx").on(table.callId),
  })
)

export type ArenaActivityRow = InferSelectModel<typeof arenaActivity>
export type ArenaCallRow = InferSelectModel<typeof arenaCalls>
export type ArenaCreatorRow = InferSelectModel<typeof arenaCreators>
export type ArenaParticipationRow = InferSelectModel<typeof arenaParticipations>
export type MetadataRow = InferSelectModel<typeof metadata>
export type RawEventRow = InferSelectModel<typeof rawEvents>
export type StrategyFoldStateRow = InferSelectModel<typeof strategyFoldState>
export type StrategyPerfSnapshotRow = InferSelectModel<typeof strategyPerfSnapshots>
export type UserRow = InferSelectModel<typeof users>
export type WalletRow = InferSelectModel<typeof wallets>
