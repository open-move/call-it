import type { Config } from "../config.ts";
import type { Repository } from "../db/repo.ts";
import { logger, toLogFields } from "../logger.ts";
import { getLatestCheckpoint, isPackageEvent } from "../sui/checkpoint.ts";
import {
  fetchStrategyModuleEventPage,
  getLatestGraphqlCheckpoint,
} from "../sui/graphql-events.ts";
import type { SuiClient } from "../sui/client.ts";
import { backfillRange } from "./events.ts";
import { strategyPerformancePipelines } from "./strategy-performance.ts";
import type { PipelineDefinition } from "./events.ts";

export async function backfillStrategyPerformanceFromGraphql(
  config: Config,
  client: SuiClient,
  repo: Repository,
): Promise<void> {
  const target = await getLatestGraphqlCheckpoint(config.suiGraphqlUrl);
  const pipelines = strategyPerformancePipelines(config);

  logger.info(
    toLogFields({ target: target.toString() }),
    "strategy GraphQL backfill start",
  );

  for (const pipeline of pipelines) {
    // Isolate per-strategy failures: one strategy's backfill erroring out must
    // not abort the others (or, via the caller, the live ingest).
    try {
      await backfillStrategyPipelineFromGraphql({
        client,
        config,
        fromCheckpoint: config.ingestStartCheckpoint,
        pipeline,
        repo,
        target,
      });
    } catch (error) {
      logger.error(
        toLogFields({
          error: error instanceof Error ? error.message : String(error),
          pipeline: pipeline.name,
        }),
        "strategy GraphQL backfill failed for pipeline",
      );
    }
  }
}

export async function backfillStrategyPipelineFromGraphql(input: {
  client: SuiClient;
  config: Config;
  fromCheckpoint: bigint | null;
  pipeline: PipelineDefinition;
  repo: Repository;
  target: bigint;
}): Promise<void> {
  const storedCursor = await input.repo.getCursor(input.pipeline.name);
  const fromCursor = input.fromCheckpoint ?? storedCursor ?? input.target;
  const beforeCheckpoint = input.target + 1n;

  if (fromCursor >= input.target) {
    const cursor =
      storedCursor !== null && storedCursor > input.target
        ? storedCursor
        : input.target;
    await input.repo.setCursor(input.pipeline.name, cursor);
    logger.info(
      toLogFields({ cursor: cursor.toString(), pipeline: input.pipeline.name }),
      "strategy GraphQL backfill already current",
    );
    return;
  }

  if (input.pipeline.beforeBackfill !== undefined) {
    await input.pipeline.beforeBackfill(input.repo, fromCursor + 1n);
  }

  let cursor: string | null = null;
  let count = 0;
  do {
    const page = await fetchStrategyModuleEventPage({
      afterCheckpoint: fromCursor,
      beforeCheckpoint,
      cursor,
      packageId: input.pipeline.packageId,
      url: input.config.suiGraphqlUrl,
    });

    for (const event of page.events) {
      if (!isPackageEvent(event.meta.eventType, input.pipeline.packageId)) {
        continue;
      }
      await input.repo.withProjectionTransaction(async (ctx) => {
        await input.pipeline.handler(ctx, event);
      });
      count += 1;
    }

    if (page.hasNextPage && page.nextCursor === null) {
      throw new Error(
        `GraphQL returned hasNextPage without an endCursor for ${input.pipeline.name}`,
      );
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
    logger.info(
      toLogFields({ count, cursor, pipeline: input.pipeline.name }),
      "strategy GraphQL backfill page processed",
    );
  } while (cursor !== null);

  await input.repo.setCursor(input.pipeline.name, input.target);
  const liveTip = await getLatestCheckpoint(input.client);
  if (liveTip > input.target) {
    await backfillRange(
      input.client,
      input.repo,
      input.pipeline,
      input.target + 1n,
      liveTip,
    );
  }

  if (input.pipeline.afterBackfill !== undefined) {
    await input.pipeline.afterBackfill(input.client, input.repo);
  }

  logger.info(
    toLogFields({
      count,
      cursor:
        (await input.repo.getCursor(input.pipeline.name))?.toString() ?? null,
      pipeline: input.pipeline.name,
    }),
    "strategy GraphQL backfill complete",
  );
}
