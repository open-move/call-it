import { buildApi } from "./api.ts"
import { loadConfig } from "./config.ts"
import type { Config } from "./config.ts"
import { openDatabase, runMigrations } from "./db/database.ts"
import { Repository } from "./db/repo.ts"
import { arenaPipeline } from "./ingest/arena.ts"
import { PIPELINE } from "./ingest/cursor.ts"
import { backfillRange, runPipelineStream } from "./ingest/events.ts"
import type { PipelineDefinition } from "./ingest/events.ts"
import { IngestGates } from "./ingest/gate.ts"
import { backfillStrategyPerformanceFromGraphql } from "./ingest/strategy-graphql-backfill.ts"
import { runStrategyRepairLoop } from "./ingest/strategy-repair.ts"
import { strategyPerformancePipelines } from "./ingest/strategy-performance.ts"
import { logger, toLogFields } from "./logger.ts"
import { createSuiClient } from "./sui/client.ts"
import type { SuiClient } from "./sui/client.ts"
import { getLatestCheckpoint } from "./sui/checkpoint.ts"

const VALID_COMMANDS = new Set(["serve", "ingest", "once", "strategy-backfill", "status"])

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
    await runStatus(repo)
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
    await ingestOnce(client, repo, pipelines)
    await database.pool.end()
    return
  }

  if (command === "strategy-backfill") {
    await backfillStrategyPerformanceFromGraphql(config, client, repo)
    await database.pool.end()
    return
  }

  // serve: run the HTTP API and the background ingest streams together.
  await serve(config, client, repo, pipelines)
}

function buildPipelines(config: Config): PipelineDefinition[] {
  return [arenaPipeline(config), ...strategyPerformancePipelines(config)]
}

// One-shot backfill: catch each pipeline up from its cursor to the current tip,
// then exit. No live stream.
async function ingestOnce(
  client: SuiClient,
  repo: Repository,
  pipelines: PipelineDefinition[]
): Promise<void> {
  const tip = await getLatestCheckpoint(client)
  for (const pipeline of pipelines) {
    const cursor = (await repo.getCursor(pipeline.name)) ?? tip
    if (cursor === tip) {
      // Fresh pipeline: anchor at the tip rather than backfilling from genesis.
      await repo.setCursor(pipeline.name, tip)
    }
    await backfillRange(client, repo, pipeline, cursor + 1n, tip)
    if (pipeline.afterBackfill !== undefined) {
      await pipeline.afterBackfill(client, repo)
    }
    logger.info(
      toLogFields({ cursor: (await repo.getCursor(pipeline.name))?.toString() ?? null, pipeline: pipeline.name }),
      "ingest once complete"
    )
  }
}

// Run every pipeline's live checkpoint stream concurrently until a stop signal.
async function ingestForever(
  config: Config,
  client: SuiClient,
  repo: Repository,
  pipelines: PipelineDefinition[]
): Promise<void> {
  const control = installSignalHandlers()
  const gates = new IngestGates()
  await Promise.all(
    [
      ...pipelines.map((pipeline) =>
        runPipelineStream(config, client, repo, pipeline, () => control.stopping, gates.get(pipeline.name)).catch(
          (error: unknown) => {
            logger.error(
              toLogFields({
                error: error instanceof Error ? error.message : String(error),
                pipeline: pipeline.name,
              }),
              "pipeline stream crashed"
            )
          }
        )
      ),
      runStrategyRepairLoop({
        client,
        config,
        gates,
        isStopping: () => control.stopping,
        pipelines,
        repo,
      }).catch((error: unknown) => {
        logger.error(
          toLogFields({ error: error instanceof Error ? error.message : String(error) }),
          "strategy repair loop crashed"
        )
      }),
    ]
  )
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

  // Background ingest streams run alongside the API in the same process.
  void ingestForever(config, client, repo, pipelines).catch((error: unknown) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "background ingest crashed"
    )
  })
}

async function runStatus(repo: Repository): Promise<void> {
  const pipelines = Object.values(PIPELINE)
  const cursors = Object.fromEntries(
    await Promise.all(
      pipelines.map(async (pipeline) => [pipeline, (await repo.getCursor(pipeline))?.toString() ?? null])
    )
  )
  logger.info(
    toLogFields({
      cursors,
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

main().catch((error: unknown) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, "backend failed")
  process.exitCode = 1
})
