import assert from "node:assert/strict"
import { describe, test } from "node:test"

import type { Config } from "../src/config.ts"
import type { Repository } from "../src/db/repo.ts"
import { buildStatusApp } from "../src/server.ts"
import type { SuiClient } from "../src/sui.ts"

describe("buildStatusApp", () => {
  test("keeps /healthz public when a status token is configured", async () => {
    const response = await request(appWith({ statusToken: "secret" }), "/healthz")

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
  })

  test("rejects /status without a bearer token when configured", async () => {
    const response = await request(appWith({ statusToken: "secret" }), "/status")

    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: "unauthorized" })
  })

  test("rejects /status with the wrong bearer token", async () => {
    const response = await request(appWith({ statusToken: "secret" }), "/status", "wrong")

    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: "unauthorized" })
  })

  test("allows /status with the right bearer token and preserves response shape", async () => {
    const response = await request(appWith({ statusToken: "secret" }), "/status", "secret")

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      checkpointLag: "5",
      counts: { positions: 2, rawEvents: 3, txs: 4 },
      dryRun: true,
      keeper: null,
      lastScannedCheckpoint: "100",
      latestCheckpoint: "105",
      minSuiBalance: "50000000",
      redeemableCount: 1,
      redeemedCount: 2,
      rewardVaultId: null,
    })
  })
})

function appWith(config: Partial<Config> = {}) {
  return buildStatusApp({ ...baseConfig, ...config }, fakeClient(), fakeRepo())
}

function request(app: ReturnType<typeof buildStatusApp>, path: string, token?: string) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      headers: token === undefined ? undefined : { authorization: `Bearer ${token}` },
    })
  )
}

const baseConfig: Config = {
  clockObjectId: "0x6",
  dbPath: ":memory:",
  dryRun: true,
  httpPort: 8801,
  maxBatchSize: 10,
  maxCheckpointsPerScan: 25,
  minPayout: 1n,
  minSuiBalance: 50_000_000n,
  pollSeconds: 15,
  predictObjectId: "0xpredict",
  predictPackageId: "0xpackage",
  predictQuoteAsset: "0xquote::dusdc::DUSDC",
  redeemKey: null,
  rewardCoinType: "0x2::sui::SUI",
  rewardPackageId: null,
  rewardVaultId: null,
  startCheckpoint: null,
  startFromLatest: false,
  statusCorsOrigin: null,
  statusToken: null,
  suiNetwork: "testnet",
  suiRpcUrl: "http://localhost",
  suiRpcUrls: ["http://localhost"],
}

function fakeClient(): SuiClient {
  return {
    ledgerService: {
      getServiceInfo: () => ({ response: Promise.resolve({ checkpointHeight: 105n }) }),
    },
  } as unknown as SuiClient
}

function fakeRepo(): Repository {
  return {
    counts: () => Promise.resolve({ positions: 2, rawEvents: 3, txs: 4 }),
    getLastScannedCheckpoint: () => Promise.resolve(100n),
    listPositions: () => Promise.resolve({ rows: [], total: 0 }),
    listReconcileErrors: () => Promise.resolve([]),
    listTxs: () => Promise.resolve({ rows: [], total: 0 }),
    summaryCounts: () => Promise.resolve({ redeemable: 1, redeemed: 2 }),
  } as unknown as Repository
}
