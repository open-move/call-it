import { cors } from "@elysiajs/cors"
import { node } from "@elysiajs/node"
import { Elysia } from "elysia"

import type { Config } from "./config.ts"
import type { Repository } from "./db/repo.ts"
import { logger, toLogFields } from "./logger.ts"
import type { SuiClient } from "./sui.ts"
import { getSuiBalance, loadRedeemKeypair } from "./sui.ts"

/// Read-only operational snapshot: DB counts, scan lag vs chain head, keeper gas
/// balance, and reward-vault binding. Degrades gracefully if the chain is
/// unreachable so the dashboard still renders DB state.
async function buildStatus(config: Config, client: SuiClient, repo: Repository) {
  const [counts, lastScannedCheckpoint] = await Promise.all([
    repo.counts(),
    repo.getLastScannedCheckpoint(),
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
    rewardVaultId: config.rewardVaultId,
  }
}

export function buildStatusApp(config: Config, client: SuiClient, repo: Repository) {
  return new Elysia({ adapter: node() })
    .use(cors())
    .get("/healthz", () => ({ ok: true }))
    .get("/status", () => buildStatus(config, client, repo).then(toLogFields))
    .get("/positions", () => repo.listPositions().then(toLogFields))
    .get("/txs", () => repo.listTxs().then(toLogFields))
    .get("/reconcile-errors", () => repo.listReconcileErrors().then(toLogFields))
}

export function startStatusServer(config: Config, client: SuiClient, repo: Repository) {
  const app = buildStatusApp(config, client, repo)
  app.listen(config.httpPort, () => {
    logger.info({ port: config.httpPort }, "status server listening")
  })
  return app
}
