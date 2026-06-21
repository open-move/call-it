import { loadConfig } from "./config.ts"
import { openKeeperDatabase, runMigrations } from "./db/database.ts"
import { KeeperRepository } from "./db/repo.ts"
import { logger, toLogFields } from "./logger.ts"
import { reconcileEvents } from "./reconcile.ts"
import { executeRedemptions, planRedemptions } from "./redemptions.ts"
import { scanPredictEvents } from "./scan.ts"
import { createSuiClient } from "./sui.ts"

const VALID_COMMANDS = new Set(["once", "reconcile", "scan", "status", "watch"])

async function main() {
  const command = process.argv[2] ?? "once"
  if (!VALID_COMMANDS.has(command)) {
    throw new Error(`Unknown command ${command}`)
  }

  const config = loadConfig()
  const database = openKeeperDatabase(config.dbPath)
  runMigrations(database)
  const repo = new KeeperRepository(database)
  const client = createSuiClient(config)

  if (command === "scan") {
    logger.info(toLogFields(await scanPredictEvents(config, client, repo)), "scan complete")
    return
  }

  if (command === "reconcile") {
    logger.info(toLogFields(await reconcileEvents(repo)), "reconcile complete")
    return
  }

  if (command === "status") {
    logger.info(toLogFields({
      counts: await repo.counts(),
      dryRun: config.dryRun,
      lastScannedCheckpoint: (await repo.getLastScannedCheckpoint())?.toString() ?? null,
    }), "status")
    return
  }

  if (command === "once") {
    logger.info(toLogFields(await runOnce(config, client, repo)), "once complete")
    return
  }

  await watch(config, client, repo)
}

async function runOnce(
  config: ReturnType<typeof loadConfig>,
  client: ReturnType<typeof createSuiClient>,
  repo: KeeperRepository
) {
  const scan = await scanPredictEvents(config, client, repo)
  const reconcile = await reconcileEvents(repo)
  const plans = await planRedemptions(config, repo)
  const redeem = await executeRedemptions(config, client, repo, plans)
  return {
    plannedRedemptions: plans.length,
    reconcile,
    redeem,
    scan,
  }
}

async function watch(
  config: ReturnType<typeof loadConfig>,
  client: ReturnType<typeof createSuiClient>,
  repo: KeeperRepository
) {
  let stopping = false
  const stop = () => {
    stopping = true
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)

  while (!stopping) {
    try {
      logger.info(toLogFields(await runOnce(config, client, repo)), "watch tick complete")
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "watch tick failed")
    }
    await sleep(config.pollSeconds * 1000, () => stopping)
  }

  logger.info("keeper stopped")
}

async function sleep(ms: number, shouldStop: () => boolean) {
  const interval = 250
  let elapsed = 0
  while (elapsed < ms && !shouldStop()) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(interval, ms - elapsed)))
    elapsed += interval
  }
}

main().catch((error: unknown) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, "keeper failed")
  process.exitCode = 1
})
