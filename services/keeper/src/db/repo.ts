import { and, eq, isNull } from "drizzle-orm"

import type { KeeperDatabase, PositionState, StoredRawEvent, TransactionStatus } from "./database.ts"
import { checkpointValueSchema, countRowSchema, positionFromRow, rawEventFromRow } from "./database.ts"
import { meta, oracles, positions, rawEvents, txs } from "./schema.ts"
import type { OracleSettledEvent, PositionMintedEvent, PositionRedeemedEvent } from "../predict.ts"
import { positionKey } from "../predict.ts"

const LAST_SCANNED_CHECKPOINT = "last_scanned_checkpoint"

export class KeeperRepository {
  constructor(private readonly database: KeeperDatabase) {}

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
    await this.database.db.update(rawEvents).set({ reconciledAt: Date.now() }).where(eq(rawEvents.id, id))
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
          expiry: event.expiry.toString(),
          lastCheckpoint: checkpoint,
          settlementPrice: event.settlementPrice.toString(),
          settledAt: now,
        },
        target: oracles.oracleId,
      })

    await this.database.db
      .update(positions)
      .set({ settled: true, settlementPrice: event.settlementPrice.toString() })
      .where(eq(positions.oracleId, event.oracleId))
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

  async listPositions() {
    const rows = await this.database.db.query.positions.findMany()
    return rows.map(positionFromRow)
  }

  async listOpenSettledPositions() {
    const rows = await this.database.db.query.positions.findMany({
      where: and(eq(positions.settled, true)),
    })
    return rows.map(positionFromRow).filter((position) => position.openQty > 0n)
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
