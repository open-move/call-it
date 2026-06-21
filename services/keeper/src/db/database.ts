import Database from "better-sqlite3"
import { migrate as runDrizzleMigrations } from "drizzle-orm/better-sqlite3/migrator"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { z } from "zod"

import * as schema from "./schema.ts"
import type { PositionRow, RawEventRow, TxRow } from "./schema.ts"

export type KeeperDatabase = ReturnType<typeof openKeeperDatabase>

export interface StoredRawEvent {
  checkpoint: number
  eventIndex: number
  eventType: string
  id: string
  json: unknown
  module: string
  packageId: string
  sender: string
  transactionDigest: string
  transactionIndex: number
}

export interface PositionState {
  cost: bigint
  expiry: bigint
  isUp: boolean
  key: string
  lastCheckpoint: number
  managerId: string
  mintedQty: bigint
  openQty: bigint
  oracleId: string
  owner: string
  payout: bigint
  quoteAsset: string
  redeemedQty: bigint
  settled: boolean
  settlementPrice: bigint | null
  strike: bigint
}

export type TransactionStatus = "dry_run" | "failed" | "sim_failed" | "submitted" | "succeeded"
export type StoredTx = TxRow

const unsignedIntegerString = z.string().regex(/^\d+$/).transform((value) => BigInt(value))

const jsonString = z.string().transform((value, context) => {
  try {
    return JSON.parse(value) as unknown
  } catch {
    context.addIssue({ code: "custom", message: "invalid JSON" })
    return z.NEVER
  }
})

const rawEventRowSchema = z
  .object({
    checkpoint: z.number().int().nonnegative(),
    eventIndex: z.number().int().nonnegative(),
    eventType: z.string(),
    id: z.string(),
    json: jsonString,
    module: z.string(),
    packageId: z.string(),
    sender: z.string(),
    transactionDigest: z.string(),
    transactionIndex: z.number().int().nonnegative(),
  })
  .transform(
    (row): StoredRawEvent => ({
      checkpoint: row.checkpoint,
      eventIndex: row.eventIndex,
      eventType: row.eventType,
      id: row.id,
      json: row.json,
      module: row.module,
      packageId: row.packageId,
      sender: row.sender,
      transactionDigest: row.transactionDigest,
      transactionIndex: row.transactionIndex,
    })
  )

const positionRowSchema = z
  .object({
    cost: unsignedIntegerString,
    expiry: unsignedIntegerString,
    isUp: z.boolean(),
    key: z.string(),
    lastCheckpoint: z.number().int().nonnegative(),
    managerId: z.string(),
    mintedQty: unsignedIntegerString,
    openQty: unsignedIntegerString,
    oracleId: z.string(),
    owner: z.string(),
    payout: unsignedIntegerString,
    quoteAsset: z.string(),
    redeemedQty: unsignedIntegerString,
    settled: z.boolean(),
    settlementPrice: unsignedIntegerString.nullable(),
    strike: unsignedIntegerString,
  })
  .transform(
    (row): PositionState => ({
      cost: row.cost,
      expiry: row.expiry,
      isUp: row.isUp,
      key: row.key,
      lastCheckpoint: row.lastCheckpoint,
      managerId: row.managerId,
      mintedQty: row.mintedQty,
      openQty: row.openQty,
      oracleId: row.oracleId,
      owner: row.owner,
      payout: row.payout,
      quoteAsset: row.quoteAsset,
      redeemedQty: row.redeemedQty,
      settled: row.settled,
      settlementPrice: row.settlementPrice,
      strike: row.strike,
    })
  )

export const checkpointValueSchema = unsignedIntegerString

export const countRowSchema = z.object({ count: z.number().int().nonnegative() })

export function openKeeperDatabase(dbPath: string) {
  const parent = dirname(dbPath)
  if (parent !== ".") {
    mkdirSync(parent, { recursive: true })
  }

  const sqlite = new Database(dbPath)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  sqlite.pragma("busy_timeout = 5000")

  return {
    db: drizzle(sqlite, { schema }),
    sqlite,
  }
}

export function runMigrations(database: KeeperDatabase) {
  runDrizzleMigrations(database.db, { migrationsFolder: "./drizzle" })
}

export function rawEventFromRow(row: RawEventRow): StoredRawEvent {
  return rawEventRowSchema.parse(row)
}

export function positionFromRow(row: PositionRow): PositionState {
  return positionRowSchema.parse(row)
}

export function makeLocalTxId(prefix: string, positionKey: string) {
  return `${prefix}:${positionKey}:${Date.now()}`
}
