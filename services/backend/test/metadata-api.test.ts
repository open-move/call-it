import { describe, expect, test } from "bun:test"
import { SignJWT } from "jose"

import { buildApi } from "../src/api.ts"
import type { Config } from "../src/config.ts"
import type { Repository } from "../src/db/repo.ts"
import type { MetadataRow } from "../src/db/schema.ts"
import { MAX_METADATA_BYTES, hashContent } from "../src/domains/metadata.ts"

describe("metadata API", () => {
  test("rejects unauthenticated metadata writes", async () => {
    const { app } = appWithRepo()

    const response = await postMetadata(app, {
      content: { name: "Alice" },
      contentType: "application/json",
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
  })

  test("stores authenticated JSON metadata and keeps public reads open", async () => {
    const { app, repo } = appWithRepo()
    const content = { handle: "alice", name: "Alice" }
    const hash = hashContent(content)

    const response = await postMetadata(
      app,
      { content, contentType: "application/json" },
      await sessionToken()
    )
    const publicRead = await app.handle(new Request(`http://localhost/metadata/${hash}`))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ hash })
    expect(repo.rows.has(hash)).toBe(true)
    expect(publicRead.status).toBe(200)
    expect(await publicRead.json()).toEqual({ content, contentType: "application/json", hash })
  })

  test("rejects hash mismatches with a stable error code", async () => {
    const { app } = appWithRepo()

    const response = await postMetadata(
      app,
      { content: { name: "Alice" }, contentType: "application/json", hash: "deadbeef" },
      await sessionToken()
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("hash_mismatch")
  })

  test("rejects oversized metadata before storing", async () => {
    const { app, repo } = appWithRepo()

    const response = await postMetadata(
      app,
      { content: "x".repeat(MAX_METADATA_BYTES + 1), contentType: "text/plain" },
      await sessionToken()
    )

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: "metadata_too_large", maxBytes: MAX_METADATA_BYTES })
    expect(repo.rows.size).toBe(0)
  })

  test("rejects unsupported metadata content types", async () => {
    const { app, repo } = appWithRepo()

    const response = await postMetadata(
      app,
      { content: { name: "Alice" }, contentType: "application/octet-stream" },
      await sessionToken()
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "unsupported_content_type" })
    expect(repo.rows.size).toBe(0)
  })
})

function appWithRepo() {
  const repo = new FakeMetadataRepo()
  return { app: buildApi(testConfig, repo as unknown as Repository), repo }
}

function postMetadata(
  app: ReturnType<typeof buildApi>,
  body: unknown,
  token?: string
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" })
  if (token !== undefined) {
    headers.set("authorization", `Bearer ${token}`)
  }
  return app.handle(
    new Request("http://localhost/metadata", {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    })
  )
}

async function sessionToken(): Promise<string> {
  return new SignJWT({ username: "alice", wallets: ["0xalice"] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(testConfig.jwtSecret))
}

class FakeMetadataRepo {
  readonly rows = new Map<string, MetadataRow>()

  async storeMetadata(hash: string, contentJson: string, contentType: string): Promise<void> {
    if (!this.rows.has(hash)) {
      this.rows.set(hash, { contentJson, contentType, createdAt: Date.now(), hash })
    }
  }

  async getMetadata(hash: string): Promise<MetadataRow | null> {
    return this.rows.get(hash) ?? null
  }
}

const testConfig: Config = {
  arenaObjectId: "0xarena",
  arenaPackageId: "0xarena_package",
  databaseUrl: "postgres://test",
  dynamicEnvId: "dynamic-env",
  dynamicIssuer: "app.dynamicauth.com/dynamic-env",
  dynamicJwksUrl: "https://example.invalid/jwks",
  ingestMaxCheckpointsPerScan: 25,
  ingestPollSeconds: 15,
  ingestStartCheckpoint: null,
  jwtSecret: "test-secret-do-not-use",
  jwtTtlSeconds: 3600,
  port: 8080,
  predictObjectId: "0xpredict",
  predictPackageId: "0xpredict_package",
  predictServerUrl: "https://example.invalid/predict",
  strategyObjectIds: {
    bullishUpside: null,
    hedgedPlp: null,
    plpCollar: null,
    rangeLadder: null,
    strangle: null,
  },
  strategyPackageIds: {
    bullishUpside: null,
    hedgedPlp: null,
    plpCollar: null,
    rangeLadder: null,
    strangle: null,
  },
  strategyRepairCursorLagCheckpoints: 10,
  strategyRepairPollSeconds: 300,
  suiGraphqlUrl: "https://example.invalid/graphql",
  suiNetwork: "testnet",
  suiRpcUrl: "https://example.invalid/sui",
  suiRpcUrls: ["https://example.invalid/sui"],
}
