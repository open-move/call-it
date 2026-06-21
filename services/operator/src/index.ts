import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"

import { parseCliOptions, type CliOptions, type ProductSelection } from "./cli.ts"
import { loadConfig, type OperatorConfig } from "./config.ts"
import { logger, toLogFields } from "./logger.ts"
import { hedgedPlpDriver } from "./strategies/hedged-plp.ts"
import { rangeLadderDriver } from "./strategies/range-ladder.ts"
import { runStrategyTick, type TickOptions } from "./strategy/engine.ts"
import { createSuiClient, loadKeeperKeypair, type SuiClient } from "./sui.ts"

interface StrategyRunner {
  enabled(config: OperatorConfig): boolean
  kind: Exclude<ProductSelection, "all">
  run(
    client: SuiClient,
    keypair: Ed25519Keypair | undefined,
    config: OperatorConfig,
    options: TickOptions
  ): Promise<void>
}

// Each runner closes over its concretely-typed driver, so the engine's generic
// State stays sound without an `any` escape hatch.
const RUNNERS: StrategyRunner[] = [
  {
    enabled: (config) => config.hedgedPlp.enabled,
    kind: "hedged_plp",
    run: (client, keypair, config, options) =>
      runStrategyTick(hedgedPlpDriver, client, keypair, config, options),
  },
  {
    enabled: (config) => config.rangeLadder.enabled,
    kind: "range_ladder",
    run: (client, keypair, config, options) =>
      runStrategyTick(rangeLadderDriver, client, keypair, config, options),
  },
]

function shouldRun(runner: StrategyRunner, products: ProductSelection[], config: OperatorConfig) {
  return products.includes(runner.kind) || (products.includes("all") && runner.enabled(config))
}

async function runTick(options: CliOptions) {
  const config = loadConfig()
  const dryRun = options.dryRun || config.dryRun
  const client = createSuiClient(config)
  const active = RUNNERS.filter((runner) => shouldRun(runner, options.products, config))

  if (active.length === 0) {
    logger.info("no enabled strategies selected")
    return
  }

  const keypair = options.action === "status" ? undefined : loadKeeperKeypair()
  logger.info(
    toLogFields({ action: options.action, dryRun, strategies: active.map((runner) => runner.kind) }),
    "operator tick"
  )

  for (const runner of active) {
    try {
      await runner.run(client, keypair, config, { action: options.action, dryRun })
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), strategy: runner.kind },
        "strategy tick failed"
      )
    }
  }
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2))

  if (!options.watch) {
    await runTick(options)
    return
  }

  const config = loadConfig()
  logger.info(toLogFields({ pollSeconds: config.pollSeconds, products: options.products }), "operator watching")

  let running = false
  const tick = async () => {
    if (running) {
      logger.warn("previous tick still running; skipped")
      return
    }
    running = true
    try {
      await runTick(options)
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "operator tick error")
    } finally {
      running = false
    }
  }

  await tick()
  setInterval(tick, config.pollSeconds * 1000)
}

main().catch((error: unknown) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, "operator fatal")
  process.exit(1)
})
