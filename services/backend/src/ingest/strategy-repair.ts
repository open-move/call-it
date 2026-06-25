import type { Config } from "../config.ts"
import type { Repository } from "../db/repo.ts"
import { logger, toLogFields } from "../logger.ts"
import { getLatestCheckpoint } from "../sui/checkpoint.ts"
import { getLatestGraphqlCheckpoint } from "../sui/graphql-events.ts"
import type { SuiClient } from "../sui/client.ts"
import type { PipelineDefinition } from "./events.ts"
import type { IngestGates } from "./gate.ts"
import { backfillStrategyPipelineFromGraphql } from "./strategy-graphql-backfill.ts"
import {
  readLiveStrategySupply,
  strategyPerformancePipelineConfigs,
} from "./strategy-performance.ts"

export async function runStrategyRepairLoop(input: {
  client: SuiClient
  config: Config
  gates: IngestGates
  isStopping: () => boolean
  pipelines: PipelineDefinition[]
  repo: Repository
}): Promise<void> {
  while (!input.isStopping()) {
    if (!(await waitForNextPoll(input.config.strategyRepairPollSeconds * 1000, input.isStopping))) {
      return
    }
    try {
      await runStrategyRepairCycle(input)
    } catch (error) {
      logger.error(
        toLogFields({ error: error instanceof Error ? error.message : String(error) }),
        "strategy repair cycle failed"
      )
    }
  }
}

async function runStrategyRepairCycle(input: {
  client: SuiClient
  config: Config
  gates: IngestGates
  pipelines: PipelineDefinition[]
  repo: Repository
}): Promise<void> {
  const tip = await getLatestCheckpoint(input.client)
  const maxLag = BigInt(input.config.strategyRepairCursorLagCheckpoints)
  const pipelines = new Map(input.pipelines.map((pipeline) => [pipeline.name, pipeline]))

  for (const entry of strategyPerformancePipelineConfigs(input.config)) {
    if (entry.packageId === null || entry.strategyId === null) {
      continue
    }

    const pipeline = pipelines.get(entry.name)
    if (pipeline === undefined) {
      continue
    }

    const cursor = await input.repo.getCursor(entry.name)
    if (cursor === null || tip - cursor > maxLag) {
      continue
    }

    const strategyId = entry.strategyId
    const reconstructed = await input.repo.getStrategyFoldSupply(strategyId)
    const live = await readLiveStrategySupply(input.client, strategyId)
    if (reconstructed === live || (reconstructed === null && live === 0n)) {
      continue
    }

    logger.warn(
      toLogFields({
        live: live.toString(),
        pipeline: entry.name,
        reconstructed: reconstructed?.toString() ?? null,
        strategyId,
      }),
      "strategy supply drift detected"
    )

    await input.gates.get(entry.name).runExclusive(async () => {
      await repairStrategy({
        client: input.client,
        config: input.config,
        pipeline,
        repo: input.repo,
        strategyId,
      })
    })
  }
}

async function repairStrategy(input: {
  client: SuiClient
  config: Config
  pipeline: PipelineDefinition
  repo: Repository
  strategyId: string
}): Promise<void> {
  const tip = await getLatestCheckpoint(input.client)
  const cursor = await input.repo.getCursor(input.pipeline.name)
  const maxLag = BigInt(input.config.strategyRepairCursorLagCheckpoints)
  if (cursor === null || tip - cursor > maxLag) {
    return
  }

  const reconstructed = await input.repo.getStrategyFoldSupply(input.strategyId)
  const live = await readLiveStrategySupply(input.client, input.strategyId)
  if (reconstructed === live || (reconstructed === null && live === 0n)) {
    return
  }

  const target = await getLatestGraphqlCheckpoint(input.config.suiGraphqlUrl)
  await backfillStrategyPipelineFromGraphql({
    client: input.client,
    config: input.config,
    fromCheckpoint: input.config.ingestStartCheckpoint ?? 0n,
    pipeline: input.pipeline,
    repo: input.repo,
    target,
  })

  logger.info(
    toLogFields({ pipeline: input.pipeline.name, strategyId: input.strategyId }),
    "strategy supply drift repaired"
  )
}

async function waitForNextPoll(ms: number, isStopping: () => boolean): Promise<boolean> {
  const end = Date.now() + ms
  while (!isStopping()) {
    const remaining = end - Date.now()
    if (remaining <= 0) {
      return true
    }
    await delay(Math.min(remaining, 1_000))
  }
  return false
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
