import { loadConfig } from "./config.ts"
import { openDatabase, runMigrations } from "./db/database.ts"
import { Repository } from "./db/repo.ts"
import { logger, toLogFields } from "./logger.ts"
import { reconcileEvents } from "./reconcile.ts"
import { executeRedemptions, planRedemptions } from "./redemptions.ts"
import { scanPredictEvents, seedStartCheckpointIfFresh } from "./scan.ts"
import { startStatusServer } from "./server.ts"
import { createSuiClient } from "./sui.ts"

const VALID_COMMANDS = new Set(["once", "reconcile", "scan", "serve", "status", "watch"])

async function main() {
  const command = process.argv[2] ?? "once"
  if (!VALID_COMMANDS.has(command)) {
    throw new Error(`Unknown command ${command}`)
  }

  const config = loadConfig()
  const database = openDatabase(config.dbPath)
  runMigrations(database)
  const repo = new Repository(database)
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

  if (command === "serve") {
    // Read-only status API only. Hold the process open until a signal.
    startStatusServer(config, client, repo)
    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => resolve())
      process.on("SIGTERM", () => resolve())
    })
    logger.info("keeper serve stopped")
    return
  }

  await watch(config, client, repo)
}

async function runOnce(
  config: ReturnType<typeof loadConfig>,
  client: ReturnType<typeof createSuiClient>,
  repo: Repository
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
  repo: Repository
) {
  let stopping = false
  const stop = () => {
    stopping = true
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)

  // Seed the scan cursor once up front so a bootstrap misconfig fails fast here
  // instead of erroring on every watch tick forever.
  await seedStartCheckpointIfFresh(config, client, repo)

  // Serve the read-only status API alongside the keep loop so the live keeper
  // exposes its own dashboard.
  startStatusServer(config, client, repo)

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
