import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import type { Database, PositionState, StoredRawEvent, TransactionStatus } from "./database.ts"
import { checkpointValueSchema, countRowSchema, positionFromRow, rawEventFromRow } from "./database.ts"
import { meta, oracles, positions, rawEvents, txs } from "./schema.ts"
import type { OracleSettledEvent, PositionMintedEvent, PositionRedeemedEvent } from "../predict.ts"
import { positionKey } from "../predict.ts"

const LAST_SCANNED_CHECKPOINT = "last_scanned_checkpoint"

export type PositionStatusFilter = "all" | "open" | "redeemable" | "settled"

export interface PageOptions {
  limit: number
  offset: number
}

export interface Page<T> {
  rows: T[]
  total: number
}

// "Redeemable now": settled, still open, settlement known, and the held side
// won. Numeric columns are TEXT (bigint strings), so CAST for comparisons —
// Predict prices/quantities fit comfortably in a signed 64-bit integer.
const redeemablePredicate = sql`
  ${positions.settled} = 1
  AND CAST(${positions.openQty} AS INTEGER) > 0
  AND ${positions.settlementPrice} IS NOT NULL
  AND (
    (${positions.isUp} = 1 AND CAST(${positions.settlementPrice} AS INTEGER) > CAST(${positions.strike} AS INTEGER))
    OR (${positions.isUp} = 0 AND CAST(${positions.settlementPrice} AS INTEGER) <= CAST(${positions.strike} AS INTEGER))
  )
`

function positionWhere(status: PositionStatusFilter) {
  switch (status) {
    case "open":
      return eq(positions.settled, false)
    case "settled":
      // Settled but not yet redeemable (lost, or already redeemed) — mutually
      // exclusive with the "redeemable" bucket shown in the UI.
      return and(eq(positions.settled, true), sql`NOT (${redeemablePredicate})`)
    case "redeemable":
      return redeemablePredicate
    default:
      return undefined
  }
}

export class Repository {
  constructor(private readonly database: Database) {}

  get sqlite() {
    return this.database.sqlite
  }

  async getLastScannedCheckpoint() {
    const row = await this.database.db.query.meta.findFirst({
      where: eq(meta.key, LAST_SCANNED_CHECKPOINT),
    })
    return row === undefined ? null : checkpointValueSchema.parse(row.value)
  }

  async setLastScannedCheckpoint(checkpoint: bigint) {
    const now = Date.now()
    await this.database.db
      .insert(meta)
      .values({ key: LAST_SCANNED_CHECKPOINT, updatedAt: now, value: checkpoint.toString() })
      .onConflictDoUpdate({
        set: { updatedAt: now, value: checkpoint.toString() },
        target: meta.key,
      })
  }

  async insertRawEvents(events: StoredRawEvent[]) {
    if (events.length === 0) {
      return 0
    }

    await this.database.db
      .insert(rawEvents)
      .values(
        events.map((event) => ({
          ...event,
          insertedAt: Date.now(),
          json: JSON.stringify(event.json),
          reconciledAt: null,
        }))
      )
      .onConflictDoNothing()

    return events.length
  }

  async listUnreconciledRawEvents(limit: number) {
    const rows = await this.database.db.query.rawEvents.findMany({
      limit,
      orderBy: (table, { asc }) => [asc(table.checkpoint), asc(table.transactionIndex), asc(table.eventIndex)],
      where: isNull(rawEvents.reconciledAt),
    })
    return rows.map(rawEventFromRow)
  }

  async markRawEventReconciled(id: string) {
    await this.database.db
      .update(rawEvents)
      .set({ reconcileError: null, reconciledAt: Date.now() })
      .where(eq(rawEvents.id, id))
  }

  async markRawEventFailed(id: string, error: string) {
    await this.database.db
      .update(rawEvents)
      .set({ reconcileError: error, reconciledAt: Date.now() })
      .where(eq(rawEvents.id, id))
  }

  async upsertOracleSettled(event: OracleSettledEvent, checkpoint: number) {
    const now = Date.now()
    await this.database.db
      .insert(oracles)
      .values({
        expiry: event.expiry.toString(),
        lastCheckpoint: checkpoint,
        oracleId: event.oracleId,
        settlementPrice: event.settlementPrice.toString(),
        settledAt: now,
      })
      .onConflictDoUpdate({
        set: {
          lastCheckpoint: checkpoint,
          settlementPrice: event.settlementPrice.toString(),
          settledAt: now,
        },
        target: [oracles.oracleId, oracles.expiry],
      })

    // Settlement is per (oracle, expiry): only flag positions of the same
    // expiry so other rounds on the same oracle id are not mismarked.
    await this.database.db
      .update(positions)
      .set({ settled: true, settlementPrice: event.settlementPrice.toString() })
      .where(and(eq(positions.oracleId, event.oracleId), eq(positions.expiry, event.expiry.toString())))
  }

  async applyMint(event: PositionMintedEvent, checkpoint: number) {
    const key = positionKey(event)
    const existing = await this.getPositionRow(key)
    if (existing === null) {
      await this.database.db.insert(positions).values({
        cost: event.cost.toString(),
        expiry: event.expiry.toString(),
        isUp: event.isUp,
        key,
        lastCheckpoint: checkpoint,
        managerId: event.managerId,
        mintedQty: event.quantity.toString(),
        openQty: event.quantity.toString(),
        oracleId: event.oracleId,
        owner: event.trader,
        payout: "0",
        quoteAsset: event.quoteAsset,
        redeemedQty: "0",
        settled: false,
        settlementPrice: null,
        strike: event.strike.toString(),
      })
      return
    }

    const current = positionFromRow(existing)
    await this.database.db
      .update(positions)
      .set({
        cost: (current.cost + event.cost).toString(),
        lastCheckpoint: checkpoint,
        mintedQty: (current.mintedQty + event.quantity).toString(),
        openQty: (current.openQty + event.quantity).toString(),
      })
      .where(eq(positions.key, key))
  }

  async applyRedeem(event: PositionRedeemedEvent, checkpoint: number) {
    const key = positionKey(event)
    const existing = await this.getPositionRow(key)
    if (existing === null) {
      await this.database.db.insert(positions).values({
        cost: "0",
        expiry: event.expiry.toString(),
        isUp: event.isUp,
        key,
        lastCheckpoint: checkpoint,
        managerId: event.managerId,
        mintedQty: "0",
        openQty: "0",
        oracleId: event.oracleId,
        owner: event.owner,
        payout: event.payout.toString(),
        quoteAsset: event.quoteAsset,
        redeemedQty: event.quantity.toString(),
        settled: event.isSettled,
        settlementPrice: null,
        strike: event.strike.toString(),
      })
      return
    }

    const current = positionFromRow(existing)
    const redeemedQty = current.redeemedQty + event.quantity
    const openQty = current.openQty > event.quantity ? current.openQty - event.quantity : 0n
    await this.database.db
      .update(positions)
      .set({
        lastCheckpoint: checkpoint,
        openQty: openQty.toString(),
        payout: (current.payout + event.payout).toString(),
        redeemedQty: redeemedQty.toString(),
        settled: current.settled || event.isSettled,
      })
      .where(eq(positions.key, key))
  }

  async listPositions(
    options: PageOptions & { status: PositionStatusFilter }
  ): Promise<Page<PositionState>> {
    const where = positionWhere(options.status)
    const rows = await this.database.db.query.positions.findMany({
      limit: options.limit,
      offset: options.offset,
      // Redeemable-now first, then still-open, then most recently touched.
      orderBy: [
        sql`(CASE WHEN (${redeemablePredicate}) THEN 2 ELSE 0 END) + (CASE WHEN CAST(${positions.openQty} AS INTEGER) > 0 THEN 1 ELSE 0 END) DESC`,
        desc(positions.lastCheckpoint),
      ],
      where,
    })
    const totalResult = await this.database.db
      .select({ total: sql<number>`count(*)` })
      .from(positions)
      .where(where)
    return { rows: rows.map(positionFromRow), total: totalResult[0]?.total ?? 0 }
  }

  /// Heartbeat figures the dashboard needs without paging the whole table.
  async summaryCounts() {
    const redeemableResult = await this.database.db
      .select({ count: sql<number>`count(*)` })
      .from(positions)
      .where(redeemablePredicate)
    const redeemedResult = await this.database.db
      .select({ count: sql<number>`count(*)` })
      .from(txs)
      .where(eq(txs.status, "succeeded"))
    return {
      redeemable: redeemableResult[0]?.count ?? 0,
      redeemed: redeemedResult[0]?.count ?? 0,
    }
  }

  async listOpenSettledPositions() {
    const rows = await this.database.db.query.positions.findMany({
      where: and(eq(positions.settled, true)),
    })
    return rows.map(positionFromRow).filter((position) => position.openQty > 0n)
  }

  /// Position keys with a submitted or succeeded redemption tx. These are
  /// awaiting their on-chain PositionRedeemed event and must not be re-planned,
  /// or they re-simulate and fail every tick until the event lands.
  async listResolvedPositionKeys() {
    const rows = await this.database.db
      .select({ positionKey: txs.positionKey })
      .from(txs)
      .where(inArray(txs.status, ["submitted", "succeeded"]))
    return new Set(rows.map((row) => row.positionKey))
  }

  async recordTx(input: {
    digest: string
    error?: string
    expectedPayout: bigint
    managerId: string
    oracleId: string
    positionKey: string
    quantity: bigint
    status: TransactionStatus
  }) {
    const now = Date.now()
    await this.database.db
      .insert(txs)
      .values({
        createdAt: now,
        digest: input.digest,
        error: input.error ?? null,
        expectedPayout: input.expectedPayout.toString(),
        managerId: input.managerId,
        oracleId: input.oracleId,
        positionKey: input.positionKey,
        quantity: input.quantity.toString(),
        status: input.status,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: { error: input.error ?? null, status: input.status, updatedAt: now },
        target: txs.digest,
      })
  }

  async listTxs(
    options: PageOptions & { status: string }
  ): Promise<Page<typeof txs.$inferSelect>> {
    const where = options.status === "all" ? undefined : eq(txs.status, options.status)
    const rows = await this.database.db.query.txs.findMany({
      limit: options.limit,
      offset: options.offset,
      orderBy: (table, { desc: descend }) => [descend(table.createdAt)],
      where,
    })
    const totalResult = await this.database.db
      .select({ total: sql<number>`count(*)` })
      .from(txs)
      .where(where)
    return { rows, total: totalResult[0]?.total ?? 0 }
  }

  async listReconcileErrors(limit = 200) {
    const rows = await this.database.db.query.rawEvents.findMany({
      limit,
      orderBy: (table, { desc }) => [desc(table.checkpoint)],
      where: isNotNull(rawEvents.reconcileError),
    })
    return rows.map((row) => ({
      checkpoint: row.checkpoint,
      error: row.reconcileError,
      eventType: row.eventType,
      id: row.id,
      transactionDigest: row.transactionDigest,
    }))
  }

  async counts() {
    const rawCount = this.database.sqlite.prepare("SELECT COUNT(*) AS count FROM raw_events").get()
    const positionCount = this.database.sqlite.prepare("SELECT COUNT(*) AS count FROM positions").get()
    const txCount = this.database.sqlite.prepare("SELECT COUNT(*) AS count FROM txs").get()
    return {
      positions: countRowSchema.parse(positionCount).count,
      rawEvents: countRowSchema.parse(rawCount).count,
      txs: countRowSchema.parse(txCount).count,
    }
  }

  private async getPositionRow(key: string) {
    const row = await this.database.db.query.positions.findFirst({ where: eq(positions.key, key) })
    return row ?? null
  }
}
