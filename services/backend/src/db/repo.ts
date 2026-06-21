import { and, asc, desc, eq, or, sql } from "drizzle-orm"

import { newId } from "../ids.ts"
import type { Database } from "./database.ts"
import {
  arenaActivity,
  arenaBondClaimedEvents,
  arenaBondReclaimedEvents,
  arenaCallBackedEvents,
  arenaCallFadedEvents,
  arenaCallLaunchedEvents,
  arenaCalls,
  arenaCreators,
  arenaParticipations,
  ingestCursors,
  metadata,
  rawEvents,
} from "./schema.ts"
import type { ArenaCallRow, ArenaCreatorRow, MetadataRow, RawEventRow } from "./schema.ts"
import type { EventMeta } from "../sui/checkpoint.ts"
import type {
  CallLaunchedEvent,
  CallParticipationEvent,
  CreatorBondClaimedEvent,
  CreatorBondReclaimedEvent,
} from "../domains/arena.ts"

// A transaction-scoped database handle (the type drizzle hands to a tx
// callback). Used so a checkpoint's inserts + cursor advance commit atomically.
type Tx = Parameters<Parameters<Database["db"]["transaction"]>[0]>[0]

export interface RawEventInput {
  contents: string | null
  json: string | null
  meta: EventMeta
}

export class Repository {
  constructor(private readonly database: Database) {}

  // ----- cursors ---------------------------------------------------------

  async getCursor(pipeline: string): Promise<bigint | null> {
    const row = await this.database.db.query.ingestCursors.findFirst({
      where: eq(ingestCursors.pipeline, pipeline),
    })
    return row === undefined ? null : row.checkpoint
  }

  async setCursor(pipeline: string, checkpoint: bigint): Promise<void> {
    await this.upsertCursor(this.database.db, pipeline, checkpoint)
  }

  // Run a single checkpoint's inserts + cursor advance in one transaction so the
  // cursor never moves ahead of committed rows.
  async withCheckpointTransaction(
    pipeline: string,
    checkpoint: bigint,
    run: (ctx: CheckpointContext) => Promise<void>
  ): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      await run(new CheckpointContext(tx))
      await this.upsertCursor(tx, pipeline, checkpoint)
    })
  }

  private async upsertCursor(executor: Tx | Database["db"], pipeline: string, checkpoint: bigint) {
    await executor
      .insert(ingestCursors)
      .values({ checkpoint, pipeline, updatedAt: Date.now() })
      .onConflictDoUpdate({
        set: { checkpoint, updatedAt: Date.now() },
        target: ingestCursors.pipeline,
      })
  }

  // ----- metadata --------------------------------------------------------

  async storeMetadata(hash: string, contentJson: string, contentType: string): Promise<void> {
    await this.database.db
      .insert(metadata)
      .values({ contentJson, contentType, createdAt: Date.now(), hash })
      .onConflictDoNothing()
  }

  async getMetadata(hash: string): Promise<MetadataRow | null> {
    const row = await this.database.db.query.metadata.findFirst({ where: eq(metadata.hash, hash) })
    return row ?? null
  }

  async getMetadataMany(hashes: string[]): Promise<Map<string, MetadataRow>> {
    const result = new Map<string, MetadataRow>()
    const unique = [...new Set(hashes.filter((hash) => hash.length > 0))]
    for (const hash of unique) {
      const row = await this.getMetadata(hash)
      if (row !== null) {
        result.set(hash, row)
      }
    }
    return result
  }

  // ----- arena reads -----------------------------------------------------

  async listCalls(): Promise<ArenaCallRow[]> {
    return this.database.db.query.arenaCalls.findMany({
      orderBy: (table) => [desc(table.createdAtMs)],
    })
  }

  // Accepts either our internal ULID or the chain call object id, so links keep
  // working whether they carry the public id or a raw on-chain reference.
  async getCall(idOrCallId: string): Promise<ArenaCallRow | null> {
    const row = await this.database.db.query.arenaCalls.findFirst({
      where: or(eq(arenaCalls.id, idOrCallId), eq(arenaCalls.callId, idOrCallId)),
    })
    return row ?? null
  }

  async listCreators(): Promise<ArenaCreatorRow[]> {
    return this.database.db.query.arenaCreators.findMany({
      orderBy: (table) => [desc(table.callCount)],
    })
  }

  async getCreator(address: string): Promise<ArenaCreatorRow | null> {
    const row = await this.database.db.query.arenaCreators.findFirst({
      where: eq(arenaCreators.address, address.toLowerCase()),
    })
    return row ?? null
  }

  async getCreatorById(id: string): Promise<ArenaCreatorRow | null> {
    const row = await this.database.db.query.arenaCreators.findFirst({
      where: eq(arenaCreators.id, id),
    })
    return row ?? null
  }

  async listCallsByCreator(address: string): Promise<ArenaCallRow[]> {
    return this.database.db.query.arenaCalls.findMany({
      orderBy: (table) => [desc(table.createdAtMs)],
      where: eq(arenaCalls.creator, address.toLowerCase()),
    })
  }

  async listActivity(limit: number): Promise<typeof arenaActivity.$inferSelect[]> {
    return this.database.db.query.arenaActivity.findMany({
      limit,
      orderBy: (table) => [desc(table.id)],
    })
  }

  async listActivityForCall(callId: string): Promise<typeof arenaActivity.$inferSelect[]> {
    return this.database.db.query.arenaActivity.findMany({
      orderBy: (table) => [asc(table.id)],
      where: eq(arenaActivity.callId, callId),
    })
  }

  // activeCalls is derived at read time from oracle state (the source of truth),
  // not stored — see the /arena handler. Everything here is event-derived.
  async summary() {
    const creatorCount = await this.countAll(arenaCreators)
    const participantCount = await this.countDistinctParticipants()
    const bondedPlp = await this.sumBondedPlp()
    return { bondedPlp, creatorCount, participantCount }
  }

  async counts() {
    return {
      activity: await this.countAll(arenaActivity),
      calls: await this.countAll(arenaCalls),
      creators: await this.countAll(arenaCreators),
      participations: await this.countAll(arenaParticipations),
      rawEvents: await this.countAll(rawEvents),
    }
  }

  private async countAll(table: { _: { name: string } }): Promise<number> {
    const result = await this.database.db.execute(
      sql`SELECT COUNT(*)::int AS count FROM ${sql.identifier(table._.name)}`
    )
    return readCount(result.rows[0])
  }

  private async countDistinctParticipants(): Promise<number> {
    const result = await this.database.db.execute(
      sql`SELECT COUNT(DISTINCT participant)::int AS count FROM arena_participations`
    )
    return readCount(result.rows[0])
  }

  private async sumBondedPlp(): Promise<string> {
    const result = await this.database.db.execute(
      sql`SELECT COALESCE(SUM(bonded_plp::numeric), 0)::text AS total FROM arena_creators`
    )
    const row = result.rows[0]
    if (row !== undefined && typeof row.total === "string") {
      return row.total
    }
    return "0"
  }
}

// Per-checkpoint write surface. All inserts are idempotent (ON CONFLICT DO
// NOTHING on the event_id PK) so a re-scanned checkpoint never double-counts.
export class CheckpointContext {
  constructor(private readonly tx: Tx) {}

  async insertRawEvent(input: RawEventInput): Promise<void> {
    await this.tx
      .insert(rawEvents)
      .values({
        checkpoint: input.meta.checkpoint,
        checkpointTimestampMs: input.meta.checkpointTimestampMs,
        contents: input.contents,
        digest: input.meta.digest,
        eventId: input.meta.eventId,
        eventIndex: input.meta.eventIndex,
        eventType: input.meta.eventType,
        insertedAt: Date.now(),
        json: input.json,
        module: input.meta.module,
        packageId: input.meta.packageId,
        sender: input.meta.sender,
        txIndex: input.meta.txIndex,
      })
      .onConflictDoNothing({ target: rawEvents.eventId })
  }

  // --- CallLaunched ---

  async applyCallLaunched(meta: EventMeta, event: CallLaunchedEvent): Promise<void> {
    await this.tx
      .insert(arenaCallLaunchedEvents)
      .values({
        arenaId: event.arenaId,
        bondPlpAmount: event.bondPlpAmount,
        callId: event.callId,
        checkpoint: meta.checkpoint,
        createdAtMs: event.createdAtMs,
        creator: event.creator,
        digest: meta.digest,
        eventId: meta.eventId,
        eventIndex: meta.eventIndex,
        expiry: event.expiry,
        isUp: event.isUp,
        oracleId: event.oracleId,
        predictId: event.predictId,
        strike: event.strike,
      })
      .onConflictDoNothing({ target: arenaCallLaunchedEvents.eventId })

    await this.tx
      .insert(arenaCalls)
      .values({
        backers: 0,
        bondClaimed: false,
        bondPlpAmount: event.bondPlpAmount,
        callId: event.callId,
        createdAtMs: event.createdAtMs,
        creator: event.creator,
        expiry: event.expiry,
        faders: 0,
        id: newId(),
        isUp: event.isUp,
        oracleId: event.oracleId,
        predictId: event.predictId,
        strike: event.strike,
      })
      .onConflictDoNothing({ target: arenaCalls.callId })

    await this.tx
      .insert(arenaCreators)
      .values({
        address: event.creator,
        bondedPlp: event.bondPlpAmount,
        callCount: 1,
        id: newId(),
      })
      .onConflictDoUpdate({
        set: {
          bondedPlp: sql`${arenaCreators.bondedPlp}::numeric + ${event.bondPlpAmount}::numeric`,
          callCount: sql`${arenaCreators.callCount} + 1`,
        },
        target: arenaCreators.address,
      })

    await this.insertActivity(meta, "launched", event.creator, event.callId)
  }

  // --- CallBacked / CallFaded ---

  async applyParticipation(
    meta: EventMeta,
    side: "back" | "fade",
    event: CallParticipationEvent
  ): Promise<void> {
    const table = side === "back" ? arenaCallBackedEvents : arenaCallFadedEvents
    await this.tx
      .insert(table)
      .values({
        callId: event.callId,
        checkpoint: meta.checkpoint,
        cost: event.cost,
        digest: meta.digest,
        eventId: meta.eventId,
        eventIndex: meta.eventIndex,
        managerId: event.managerId,
        participant: event.participant,
        quantity: event.quantity,
        recordedAtMs: event.recordedAtMs,
        refundAmount: event.refundAmount,
      })
      .onConflictDoNothing({ target: table.eventId })

    await this.tx
      .insert(arenaParticipations)
      .values({
        callId: event.callId,
        cost: event.cost,
        eventId: meta.eventId,
        id: newId(),
        participant: event.participant,
        quantity: event.quantity,
        recordedAtMs: event.recordedAtMs,
        side,
      })
      .onConflictDoNothing({ target: arenaParticipations.eventId })

    const counterColumn = side === "back" ? arenaCalls.backers : arenaCalls.faders
    await this.tx
      .update(arenaCalls)
      .set({ [side === "back" ? "backers" : "faders"]: sql`${counterColumn} + 1` })
      .where(eq(arenaCalls.callId, event.callId))

    await this.insertActivity(meta, side === "back" ? "backed" : "faded", event.participant, event.callId)
  }

  // --- CreatorBondClaimed (creator claimed against a settled oracle) ---

  async applyBondClaimed(meta: EventMeta, event: CreatorBondClaimedEvent): Promise<void> {
    await this.tx
      .insert(arenaBondClaimedEvents)
      .values({
        bondPlpAmount: event.bondPlpAmount,
        callId: event.callId,
        checkpoint: meta.checkpoint,
        claimedAtMs: event.claimedAtMs,
        digest: meta.digest,
        eventId: meta.eventId,
        eventIndex: meta.eventIndex,
        oracleId: event.oracleId,
      })
      .onConflictDoNothing({ target: arenaBondClaimedEvents.eventId })

    const existing = await this.tx.query.arenaCalls.findFirst({
      where: eq(arenaCalls.callId, event.callId),
    })

    await this.tx
      .update(arenaCalls)
      .set({ bondClaimed: true })
      .where(eq(arenaCalls.callId, event.callId))

    await this.insertActivity(meta, "claimed", existing?.creator ?? event.callId, event.callId)
  }

  // --- CreatorBondReclaimed (escape hatch: oracle never settled) ---

  async applyBondReclaimed(meta: EventMeta, event: CreatorBondReclaimedEvent): Promise<void> {
    await this.tx
      .insert(arenaBondReclaimedEvents)
      .values({
        bondPlpAmount: event.bondPlpAmount,
        callId: event.callId,
        checkpoint: meta.checkpoint,
        digest: meta.digest,
        eventId: meta.eventId,
        eventIndex: meta.eventIndex,
        reclaimedAtMs: event.reclaimedAtMs,
      })
      .onConflictDoNothing({ target: arenaBondReclaimedEvents.eventId })

    const existing = await this.tx.query.arenaCalls.findFirst({
      where: eq(arenaCalls.callId, event.callId),
    })

    await this.tx
      .update(arenaCalls)
      .set({ bondClaimed: true })
      .where(eq(arenaCalls.callId, event.callId))

    await this.insertActivity(meta, "reclaimed", existing?.creator ?? event.callId, event.callId)
  }

  private async insertActivity(
    meta: EventMeta,
    kind: "launched" | "backed" | "faded" | "claimed" | "reclaimed",
    actor: string,
    callId: string
  ): Promise<void> {
    await this.tx
      .insert(arenaActivity)
      .values({
        actor,
        callId,
        callLabel: callId,
        eventId: meta.eventId,
        id: newId(),
        kind,
        timestampMs: String(meta.checkpointTimestampMs),
      })
      .onConflictDoNothing({ target: arenaActivity.eventId })
  }
}

function readCount(row: Record<string, unknown> | undefined): number {
  if (row !== undefined && typeof row.count === "number") {
    return row.count
  }
  if (row !== undefined && typeof row.count === "string") {
    return Number(row.count)
  }
  return 0
}

// Re-exported guard for callers needing the composite filter helper.
export { and }
