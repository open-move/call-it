import { cors } from "@elysiajs/cors"
import { node } from "@elysiajs/node"
import { Elysia } from "elysia"

import type { Config } from "./config.ts"
import type { PositionStatusFilter, Repository } from "./db/repo.ts"
import { logger, toLogFields } from "./logger.ts"
import type { SuiClient } from "./sui.ts"
import { getSuiBalance, loadRedeemKeypair } from "./sui.ts"

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

function parseLimit(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.trunc(parsed), MAX_LIMIT)
    : DEFAULT_LIMIT
}

function parseOffset(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}

function parsePositionStatus(value: unknown): PositionStatusFilter {
  return value === "open" || value === "settled" || value === "redeemable"
    ? value
    : "all"
}

function isAuthorized(config: Config, authorization: string | undefined): boolean {
  return config.statusToken === null || authorization === `Bearer ${config.statusToken}`
}

function rejectUnauthorized(set: { status?: number | string }) {
  set.status = 401
  return { error: "unauthorized" }
}

/// Read-only operational snapshot: DB counts, scan lag vs chain head, keeper gas
/// balance, and reward-vault binding. Degrades gracefully if the chain is
/// unreachable so the dashboard still renders DB state.
async function buildStatus(config: Config, client: SuiClient, repo: Repository) {
  const [counts, lastScannedCheckpoint, summary] = await Promise.all([
    repo.counts(),
    repo.getLastScannedCheckpoint(),
    repo.summaryCounts(),
  ])

  let latestCheckpoint: bigint | null = null
  let checkpointLag: bigint | null = null
  try {
    const info = await client.ledgerService.getServiceInfo({}).response
    if (info.checkpointHeight !== undefined) {
      latestCheckpoint = info.checkpointHeight
      checkpointLag = lastScannedCheckpoint === null ? null : latestCheckpoint - lastScannedCheckpoint
    }
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, "status: chain head unavailable")
  }

  let keeper: { address: string; belowMinimum: boolean; suiBalance: bigint } | null = null
  if (config.redeemKey !== null) {
    try {
      const address = loadRedeemKeypair(config).toSuiAddress()
      const suiBalance = await getSuiBalance(client, address)
      keeper = { address, belowMinimum: suiBalance < config.minSuiBalance, suiBalance }
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, "status: keeper balance unavailable")
    }
  }

  return {
    checkpointLag,
    counts,
    dryRun: config.dryRun,
    keeper,
    lastScannedCheckpoint,
    latestCheckpoint,
    minSuiBalance: config.minSuiBalance,
    redeemableCount: summary.redeemable,
    redeemedCount: summary.redeemed,
    rewardVaultId: config.rewardVaultId,
  }
}

export function buildStatusApp(config: Config, client: SuiClient, repo: Repository) {
  const corsPlugin = config.statusCorsOrigin === null ? cors() : cors({ origin: config.statusCorsOrigin })

  return new Elysia({ adapter: node() })
    .use(corsPlugin)
    .get("/healthz", () => ({ ok: true }))
    .get("/status", ({ headers, set }) => {
      if (!isAuthorized(config, headers.authorization)) {
        return rejectUnauthorized(set)
      }
      return buildStatus(config, client, repo).then(toLogFields)
    })
    .get("/positions", ({ headers, query, set }) => {
      if (!isAuthorized(config, headers.authorization)) {
        return rejectUnauthorized(set)
      }
      return repo
        .listPositions({
          limit: parseLimit(query.limit),
          offset: parseOffset(query.offset),
          status: parsePositionStatus(query.status),
        })
        .then(toLogFields)
    })
    .get("/txs", ({ headers, query, set }) => {
      if (!isAuthorized(config, headers.authorization)) {
        return rejectUnauthorized(set)
      }
      return repo
        .listTxs({
          limit: parseLimit(query.limit),
          offset: parseOffset(query.offset),
          status: typeof query.status === "string" && query.status ? query.status : "all",
        })
        .then(toLogFields)
    })
    .get("/reconcile-errors", ({ headers, set }) => {
      if (!isAuthorized(config, headers.authorization)) {
        return rejectUnauthorized(set)
      }
      return repo.listReconcileErrors().then(toLogFields)
    })
}

export function startStatusServer(config: Config, client: SuiClient, repo: Repository) {
  const app = buildStatusApp(config, client, repo)
  if (config.statusToken === null) {
    logger.warn("keeper status endpoints are ungated; set KEEPER_STATUS_TOKEN in production")
  }
  app.listen(config.httpPort, () => {
    logger.info({ port: config.httpPort }, "status server listening")
  })
  return app
}
