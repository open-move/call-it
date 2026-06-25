import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, afterEach, before, describe, test } from "node:test"

import type { Database, StoredRawEvent } from "../src/db/database.ts"
import { openDatabase, runMigrations } from "../src/db/database.ts"
import { Repository } from "../src/db/repo.ts"
import { logger } from "../src/logger.ts"
import { reconcileEvents } from "../src/reconcile.ts"

const tempDirs: string[] = []
const previousLogLevel = logger.level

before(() => {
  logger.level = "silent"
})

after(() => {
  logger.level = previousLogLevel
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("reconcileEvents", () => {
  test("applies a mint and marks the raw event reconciled atomically", async () => {
    await withRepo(async (repo) => {
      await repo.insertRawEvents([rawMintEvent("mint-1")])

      const result = await reconcileEvents(repo)
      const positions = await repo.listPositions({ limit: 10, offset: 0, status: "all" })
      const unreconciled = await repo.listUnreconciledRawEvents(10)

      assert.deepEqual(result, { failedEvents: 0, processedEvents: 1 })
      assert.equal(positions.total, 1)
      assert.equal(positions.rows[0]?.mintedQty, 10n)
      assert.equal(positions.rows[0]?.openQty, 10n)
      assert.deepEqual(unreconciled, [])
    })
  })

  test("rolls back a mint when reconciliation fails before marking reconciled", async () => {
    await withRepo(async (repo) => {
      await repo.insertRawEvents([rawMintEvent("mint-rollback")])

      const result = await reconcileEvents(repo, {
        onAfterApply: () => {
          throw new Error("simulated post-apply failure")
        },
      })
      const positions = await repo.listPositions({ limit: 10, offset: 0, status: "all" })
      const errors = await repo.listReconcileErrors()
      const unreconciled = await repo.listUnreconciledRawEvents(10)

      assert.deepEqual(result, { failedEvents: 1, processedEvents: 0 })
      assert.equal(positions.total, 0)
      assert.equal(errors.length, 1)
      assert.match(errors[0]?.error ?? "", /simulated post-apply failure/)
      assert.deepEqual(unreconciled, [])
    })
  })

  test("quarantines malformed events without mutating positions", async () => {
    await withRepo(async (repo) => {
      await repo.insertRawEvents([
        {
          ...rawMintEvent("mint-malformed"),
          json: { not_a_position_mint: true },
        },
      ])

      const result = await reconcileEvents(repo)
      const positions = await repo.listPositions({ limit: 10, offset: 0, status: "all" })
      const errors = await repo.listReconcileErrors()

      assert.deepEqual(result, { failedEvents: 1, processedEvents: 0 })
      assert.equal(positions.total, 0)
      assert.equal(errors.length, 1)
      assert.match(errors[0]?.eventType ?? "", /::predict::PositionMinted/)
    })
  })
})

async function withRepo(run: (repo: Repository) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "callit-keeper-"))
  tempDirs.push(dir)
  const database = openDatabase(join(dir, "keeper.sqlite"))
  runMigrations(database)

  try {
    await run(new Repository(database))
  } finally {
    closeDatabase(database)
  }
}

function closeDatabase(database: Database) {
  database.sqlite.close()
}

function rawMintEvent(id: string): StoredRawEvent {
  return {
    checkpoint: 42,
    eventIndex: 0,
    eventType: "0xpredict::predict::PositionMinted",
    id,
    json: {
      ask_price: "100",
      cost: "1000",
      expiry: "1700007200000",
      is_up: true,
      manager_id: "0xmanager",
      oracle_id: "0xoracle",
      predict_id: "0xpredict",
      quantity: "10",
      quote_asset: "0xquote::dusdc::DUSDC",
      strike: "100000000000",
      trader: "0xtrader",
    },
    module: "predict",
    packageId: "0xpredict",
    sender: "0xsender",
    transactionDigest: `0xdigest-${id}`,
    transactionIndex: 0,
  }
}
