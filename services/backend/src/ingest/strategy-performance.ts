import { z } from "zod"

import type { Config } from "../config.ts"
import type { CheckpointContext, Repository } from "../db/repo.ts"
import {
  isStrategyPerformanceEventType,
  parseStrategyPerformanceEvent,
} from "../domains/strategy-performance.ts"
import type { StrategyPipelineKind } from "../domains/strategy-performance.ts"
import { bytesToHex } from "../sui/bcs.ts"
import type { CheckpointEvent } from "../sui/checkpoint.ts"
import { PIPELINE } from "./cursor.ts"
import type { CheckpointHandler, PipelineDefinition } from "./events.ts"
import type { SuiClient } from "../sui/client.ts"
import { logger, toLogFields } from "../logger.ts"

interface StrategyPipelineConfig {
  kind: StrategyPipelineKind
  name: string
  packageId: string | null
  strategyId: string | null
}

const strategySupplySchema = z.object({
  treasury: z.object({ total_supply: z.object({ value: z.coerce.bigint() }) }),
})

export function strategyPerformancePipelines(config: Config): PipelineDefinition[] {
  const packages: StrategyPipelineConfig[] = [
    {
      kind: "hedged-plp",
      name: PIPELINE.HEDGED_PLP,
      packageId: config.strategyPackageIds.hedgedPlp,
      strategyId: config.strategyObjectIds.hedgedPlp,
    },
    {
      kind: "plp-collar",
      name: PIPELINE.PLP_COLLAR,
      packageId: config.strategyPackageIds.plpCollar,
      strategyId: config.strategyObjectIds.plpCollar,
    },
    {
      kind: "strangle",
      name: PIPELINE.STRANGLE,
      packageId: config.strategyPackageIds.strangle,
      strategyId: config.strategyObjectIds.strangle,
    },
    {
      kind: "bullish-upside",
      name: PIPELINE.BULLISH_UPSIDE,
      packageId: config.strategyPackageIds.bullishUpside,
      strategyId: config.strategyObjectIds.bullishUpside,
    },
    {
      kind: "range-ladder",
      name: PIPELINE.RANGE_LADDER,
      packageId: config.strategyPackageIds.rangeLadder,
      strategyId: config.strategyObjectIds.rangeLadder,
    },
  ]

  return packages.flatMap((entry) => {
    if (entry.packageId === null) {
      return []
    }
    const pipeline: PipelineDefinition = {
      handler: makeStrategyPerformanceHandler(entry.kind),
      name: entry.name,
      packageId: entry.packageId,
    }
    if (entry.strategyId !== null) {
      const strategyId = entry.strategyId
      pipeline.afterBackfill = (client: SuiClient, repo: Repository) => checksumStrategySupply(client, repo, strategyId)
      pipeline.beforeBackfill = (repo: Repository, from: bigint) => resetBeforeReplay(repo, strategyId, from)
    }
    return [pipeline]
  })
}

async function resetBeforeReplay(repo: Repository, strategyId: string, from: bigint): Promise<void> {
  if (!(await repo.shouldResetStrategyPerformance(strategyId, from))) {
    return
  }
  await repo.resetStrategyPerformance(strategyId)
  logger.warn(
    toLogFields({ from: from.toString(), strategyId }),
    "reset strategy performance fold before replay"
  )
}

async function checksumStrategySupply(client: SuiClient, repo: Repository, strategyId: string): Promise<void> {
  const reconstructed = await repo.getStrategyFoldSupply(strategyId)
  if (reconstructed === null) {
    return
  }

  const object = await client.getObject({ include: { json: true }, objectId: strategyId })
  const live = strategySupplySchema.parse(object.object.json).treasury.total_supply.value
  if (reconstructed !== live) {
    throw new Error(
      `strategy supply checksum failed for ${strategyId}: fold=${reconstructed.toString()} live=${live.toString()}`
    )
  }

  logger.info(toLogFields({ strategyId, supply: live.toString() }), "strategy supply checksum passed")
}

function makeStrategyPerformanceHandler(strategyKind: StrategyPipelineKind): CheckpointHandler {
  return async (ctx: CheckpointContext, event: CheckpointEvent): Promise<void> => {
    if (!isStrategyPerformanceEventType(event.meta.eventType)) {
      return
    }

    await ctx.insertRawEvent({
      contents: event.contents === null ? null : bytesToHex([...event.contents]),
      json: event.json === null ? null : JSON.stringify(event.json),
      meta: event.meta,
    })

    const parsed = parseStrategyPerformanceEvent(event, strategyKind)
    if (parsed === null) {
      return
    }

    await ctx.applyStrategyPerformanceEvent(event.meta, parsed)
  }
}
