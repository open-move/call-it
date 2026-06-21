import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { InferSelectModel } from "drizzle-orm"

export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  updatedAt: integer("updated_at").notNull(),
  value: text("value").notNull(),
})

export const rawEvents = sqliteTable(
  "raw_events",
  {
    checkpoint: integer("checkpoint").notNull(),
    eventIndex: integer("event_index").notNull(),
    eventType: text("event_type").notNull(),
    id: text("id").primaryKey(),
    insertedAt: integer("inserted_at").notNull(),
    json: text("json").notNull(),
    module: text("module").notNull(),
    packageId: text("package_id").notNull(),
    reconciledAt: integer("reconciled_at"),
    reconcileError: text("reconcile_error"),
    sender: text("sender").notNull(),
    transactionDigest: text("transaction_digest").notNull(),
    transactionIndex: integer("transaction_index").notNull(),
  },
  (table) => ({
    checkpointIdx: index("raw_events_checkpoint_idx").on(table.checkpoint),
    reconciledIdx: index("raw_events_reconciled_idx").on(table.reconciledAt),
  })
)

export const oracles = sqliteTable(
  "oracles",
  {
    expiry: text("expiry").notNull(),
    lastCheckpoint: integer("last_checkpoint").notNull(),
    oracleId: text("oracle_id").notNull(),
    settlementPrice: text("settlement_price").notNull(),
    settledAt: integer("settled_at").notNull(),
  },
  // A Predict oracle is identified by (oracleId, expiry): the same oracle id can
  // be reused across rounds/expiries, each with its own settlement price.
  (table) => ({
    pk: primaryKey({ columns: [table.oracleId, table.expiry] }),
  })
)

export const positions = sqliteTable(
  "positions",
  {
    cost: text("cost").notNull(),
    expiry: text("expiry").notNull(),
    isUp: integer("is_up", { mode: "boolean" }).notNull(),
    key: text("key").primaryKey(),
    lastCheckpoint: integer("last_checkpoint").notNull(),
    managerId: text("manager_id").notNull(),
    mintedQty: text("minted_qty").notNull(),
    openQty: text("open_qty").notNull(),
    oracleId: text("oracle_id").notNull(),
    owner: text("owner").notNull(),
    payout: text("payout").notNull(),
    quoteAsset: text("quote_asset").notNull(),
    redeemedQty: text("redeemed_qty").notNull(),
    settled: integer("settled", { mode: "boolean" }).notNull(),
    settlementPrice: text("settlement_price"),
    strike: text("strike").notNull(),
  },
  (table) => ({
    managerIdx: index("positions_manager_idx").on(table.managerId),
    oracleIdx: index("positions_oracle_idx").on(table.oracleId),
    openIdx: index("positions_open_idx").on(table.openQty),
  })
)

export const txs = sqliteTable(
  "txs",
  {
    createdAt: integer("created_at").notNull(),
    digest: text("digest").primaryKey(),
    error: text("error"),
    expectedPayout: text("expected_payout").notNull(),
    managerId: text("manager_id").notNull(),
    oracleId: text("oracle_id").notNull(),
    positionKey: text("position_key").notNull(),
    quantity: text("quantity").notNull(),
    status: text("status").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    positionIdx: index("txs_position_idx").on(table.positionKey),
    statusIdx: index("txs_status_idx").on(table.status),
  })
)

export type OracleRow = InferSelectModel<typeof oracles>
export type PositionRow = InferSelectModel<typeof positions>
export type RawEventRow = InferSelectModel<typeof rawEvents>
export type TxRow = InferSelectModel<typeof txs>
