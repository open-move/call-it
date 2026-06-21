import { buildApi } from "./api.ts"
import { loadConfig } from "./config.ts"
import type { Config } from "./config.ts"
import { openDatabase, runMigrations } from "./db/database.ts"
import { Repository } from "./db/repo.ts"
import { arenaPipeline } from "./ingest/arena.ts"
import { scanPipeline } from "./ingest/events.ts"
import type { PipelineDefinition } from "./ingest/events.ts"
import { logger, toLogFields } from "./logger.ts"
import { createSuiClient } from "./sui/client.ts"
import type { SuiClient } from "./sui/client.ts"

const VALID_COMMANDS = new Set(["serve", "ingest", "once", "status"])

async function main(): Promise<void> {
  const command = process.argv[2] ?? "serve"
  if (!VALID_COMMANDS.has(command)) {
    throw new Error(`Unknown command ${command}`)
  }

  const config = loadConfig()
  const database = openDatabase(config.databaseUrl)
  await runMigrations(database)
  const repo = new Repository(database)

  if (command === "status") {
    await runStatus(config, repo)
    await database.pool.end()
    return
  }

  const client = createSuiClient(config)
  const pipelines = buildPipelines(config)

  if (command === "ingest") {
    await ingestForever(config, client, repo, pipelines)
    await database.pool.end()
    return
  }

  if (command === "once") {
    await ingestOnce(config, client, repo, pipelines)
    await database.pool.end()
    return
  }

  // serve: run the HTTP API and a background ingest loop together.
  await serve(config, client, repo, pipelines)
}

function buildPipelines(config: Config): PipelineDefinition[] {
  return [arenaPipeline(config)]
}

async function ingestOnce(
  config: Config,
  client: SuiClient,
  repo: Repository,
  pipelines: PipelineDefinition[]
): Promise<void> {
  for (const pipeline of pipelines) {
    const result = await scanPipeline(config, client, repo, pipeline)
    logger.info(toLogFields(result), "ingest scan complete")
  }
}

async function ingestForever(
  config: Config,
  client: SuiClient,
  repo: Repository,
  pipelines: PipelineDefinition[]
): Promise<void> {
  const control = installSignalHandlers()
  while (!control.stopping) {
    try {
      await ingestOnce(config, client, repo, pipelines)
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "ingest tick failed"
      )
    }
    await sleep(config.ingestPollSeconds * 1000, () => control.stopping)
  }
  logger.info("ingest stopped")
}

async function serve(
  config: Config,
  client: SuiClient,
  repo: Repository,
  pipelines: PipelineDefinition[]
): Promise<void> {
  const app = buildApi(config, repo)
  app.listen({ hostname: "0.0.0.0", port: config.port }, () => {
    logger.info({ port: config.port }, "api listening")
  })

  // Background ingest loop runs alongside the API in the same process.
  void ingestForever(config, client, repo, pipelines).catch((error: unknown) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "background ingest crashed"
    )
  })
}

async function runStatus(config: Config, repo: Repository): Promise<void> {
  logger.info(
    toLogFields({
      arenaCursor: (await repo.getCursor("arena"))?.toString() ?? null,
      counts: await repo.counts(),
      summary: await repo.summary(),
    }),
    "status"
  )
}

interface SignalControl {
  stopping: boolean
}

function installSignalHandlers(): SignalControl {
  const control: SignalControl = { stopping: false }
  const stop = () => {
    control.stopping = true
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  return control
}

async function sleep(ms: number, shouldStop: () => boolean): Promise<void> {
  const interval = 250
  let elapsed = 0
  while (elapsed < ms && !shouldStop()) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(interval, ms - elapsed)))
    elapsed += interval
  }
}

main().catch((error: unknown) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, "backend failed")
  process.exitCode = 1
})
