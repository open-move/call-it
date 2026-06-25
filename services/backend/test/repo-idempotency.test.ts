import { describe, expect, test } from "bun:test"

import { CheckpointContext } from "../src/db/repo.ts"
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
} from "../src/db/schema.ts"
import type {
  CallLaunchedEvent,
  CallParticipationEvent,
  CreatorBondClaimedEvent,
  CreatorBondReclaimedEvent,
} from "../src/domains/arena.ts"
import type { EventMeta } from "../src/sui/checkpoint.ts"

type TableName =
  | "activity"
  | "backedEvent"
  | "bondClaimedEvent"
  | "bondReclaimedEvent"
  | "call"
  | "creator"
  | "fadedEvent"
  | "launchedEvent"
  | "participation"
  | "unknown"

interface InsertedValue {
  eventId?: string
}

class FakeInsertBuilder {
  private value: InsertedValue = {}

  constructor(
    private readonly tx: FakeTx,
    private readonly tableName: TableName
  ) {}

  values(value: InsertedValue): this {
    this.value = value
    this.tx.operations.push(`insert:${this.tableName}`)
    return this
  }

  onConflictDoNothing(): this {
    return this
  }

  onConflictDoUpdate(): this {
    return this
  }

  returning(): Array<{ eventId: string }> {
    const eventId = this.value.eventId
    if (eventId !== undefined && this.tx.duplicateEventIds.has(eventId)) {
      return []
    }
    return [{ eventId: eventId ?? "new-event" }]
  }
}

class FakeUpdateBuilder {
  constructor(
    private readonly tx: FakeTx,
    private readonly tableName: TableName
  ) {}

  set(): this {
    this.tx.operations.push(`update:${this.tableName}`)
    return this
  }

  where(): this {
    return this
  }
}

class FakeTx {
  readonly duplicateEventIds: Set<string>
  readonly operations: string[] = []

  readonly query = {
    arenaCalls: {
      findFirst: () => ({ creator: "0xcreator" }),
    },
  }

  constructor(duplicateEventIds: string[] = []) {
    this.duplicateEventIds = new Set(duplicateEventIds)
  }

  insert(table: unknown): FakeInsertBuilder {
    return new FakeInsertBuilder(this, tableName(table))
  }

  update(table: unknown): FakeUpdateBuilder {
    return new FakeUpdateBuilder(this, tableName(table))
  }
}

const meta: EventMeta = {
  checkpoint: 7,
  checkpointTimestampMs: 1_700_000_000,
  digest: "0xdigest",
  eventId: "event-1",
  eventIndex: 0,
  eventType: "event-type",
  module: "arena",
  packageId: "0xpackage",
  sender: "0xsender",
  txIndex: 0,
}

const launched: CallLaunchedEvent = {
  arenaId: "0xarena",
  bondPlpAmount: "1000000",
  callId: "0xcall",
  createdAtMs: "1700000000",
  creator: "0xcreator",
  expiry: "1700007200",
  isUp: true,
  oracleId: "0xoracle",
  predictId: "0xpredict",
  strike: "100000000000",
}

const participation: CallParticipationEvent = {
  callId: "0xcall",
  cost: "1000",
  managerId: "0xmanager",
  participant: "0xparticipant",
  quantity: "10",
  recordedAtMs: "1700000100",
  refundAmount: "0",
}

const bondClaimed: CreatorBondClaimedEvent = {
  bondPlpAmount: "1000000",
  callId: "0xcall",
  claimedAtMs: "1700000200",
  oracleId: "0xoracle",
}

const bondReclaimed: CreatorBondReclaimedEvent = {
  bondPlpAmount: "1000000",
  callId: "0xcall",
  reclaimedAtMs: "1700000300",
}

describe("CheckpointContext idempotency gates", () => {
  test("skips call launch projection side effects when the typed event already exists", async () => {
    const tx = new FakeTx([meta.eventId])
    const ctx = new CheckpointContext(txForContext(tx))

    await ctx.applyCallLaunched(meta, launched)

    expect(tx.operations).toEqual(["insert:launchedEvent"])
  })

  test("applies call launch projection side effects for a new typed event", async () => {
    const tx = new FakeTx()
    const ctx = new CheckpointContext(txForContext(tx))

    await ctx.applyCallLaunched(meta, launched)

    expect(tx.operations).toEqual([
      "insert:launchedEvent",
      "insert:call",
      "insert:creator",
      "insert:activity",
    ])
  })

  test("skips back and fade counters when the typed participation event already exists", async () => {
    for (const side of ["back", "fade"] as const) {
      const tx = new FakeTx([meta.eventId])
      const ctx = new CheckpointContext(txForContext(tx))

      await ctx.applyParticipation(meta, side, participation)

      expect(tx.operations).toEqual([
        side === "back" ? "insert:backedEvent" : "insert:fadedEvent",
      ])
    }
  })

  test("skips bond claim and reclaim side effects when the typed event already exists", async () => {
    const claimedTx = new FakeTx([meta.eventId])
    await new CheckpointContext(txForContext(claimedTx)).applyBondClaimed(
      meta,
      bondClaimed
    )
    expect(claimedTx.operations).toEqual(["insert:bondClaimedEvent"])

    const reclaimedTx = new FakeTx([meta.eventId])
    await new CheckpointContext(txForContext(reclaimedTx)).applyBondReclaimed(
      meta,
      bondReclaimed
    )
    expect(reclaimedTx.operations).toEqual(["insert:bondReclaimedEvent"])
  })
})

function tableName(table: unknown): TableName {
  if (table === arenaActivity) {
    return "activity"
  }
  if (table === arenaBondClaimedEvents) {
    return "bondClaimedEvent"
  }
  if (table === arenaBondReclaimedEvents) {
    return "bondReclaimedEvent"
  }
  if (table === arenaCallBackedEvents) {
    return "backedEvent"
  }
  if (table === arenaCallFadedEvents) {
    return "fadedEvent"
  }
  if (table === arenaCallLaunchedEvents) {
    return "launchedEvent"
  }
  if (table === arenaCalls) {
    return "call"
  }
  if (table === arenaCreators) {
    return "creator"
  }
  if (table === arenaParticipations) {
    return "participation"
  }
  return "unknown"
}

function txForContext(tx: FakeTx): ConstructorParameters<typeof CheckpointContext>[0] {
  return tx as unknown as ConstructorParameters<typeof CheckpointContext>[0]
}
