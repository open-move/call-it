import { Transaction } from "@mysten/sui/transactions"
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"

import { assertConfigured, type OperatorConfig } from "../config.ts"
import {
  findOracle,
  getOracleState,
  soonestEligibleOracle,
  type OracleInfo,
} from "../predict.ts"
import {
  executeTransaction,
  eventJson,
  simulateTransaction,
  type SuiClient,
} from "../sui.ts"
import {
  readHedgedPlpStrategy,
  type HedgedPlpStrategyState,
} from "../strategy-state.ts"

type HedgedPlpAction = "auto" | "realize" | "settle" | "start" | "status"

interface HedgedPlpTickOptions {
  action: HedgedPlpAction
  dryRun: boolean
}

function target(config: OperatorConfig, functionName: string) {
  return `${config.hedgedPlp.packageId}::strategy::${functionName}`
}

function bpsAmount(amount: bigint, bps: number) {
  return (amount * BigInt(Math.trunc(bps))) / 10_000n
}

function floorToGrid(value: bigint, min: bigint, tick: bigint) {
  if (tick <= 0n) {
    throw new Error("oracle tick size must be positive")
  }

  if (value <= min) {
    return min
  }

  return min + ((value - min) / tick) * tick
}

function chooseDownsideStrike(
  oracle: OracleInfo,
  spot: bigint,
  strikeSpotBps: number
) {
  const targetStrike = (spot * BigInt(Math.trunc(strikeSpotBps))) / 10_000n
  let strike = floorToGrid(targetStrike, oracle.minStrike, oracle.tickSize)

  if (strike >= spot) {
    if (strike <= oracle.minStrike) {
      throw new Error("no downside strike available on oracle grid")
    }

    strike -= oracle.tickSize
  }

  if (strike <= 0n || strike < oracle.minStrike) {
    throw new Error("computed Hedged PLP strike is outside oracle grid")
  }

  return strike
}

function buildStartRoundTx(
  config: OperatorConfig,
  strategy: HedgedPlpStrategyState,
  oracle: OracleInfo,
  strike: bigint,
  quantity: bigint,
  sender: string
) {
  const tx = new Transaction()
  tx.setSender(sender)
  tx.moveCall({
    target: target(config, "start_round"),
    typeArguments: [config.predict.quoteAsset],
    arguments: [
      tx.object(config.hedgedPlp.strategyId),
      tx.object(config.baseVault.vaultId),
      tx.object(config.hedgedPlp.keeperCapId),
      tx.object(config.predict.sharedObjectId),
      tx.object(strategy.managerId),
      tx.object(oracle.oracleId),
      tx.pure.u64(strike),
      tx.pure.u64(quantity),
      tx.object(config.predict.clockObjectId),
    ],
  })

  return tx
}

function buildSettleRoundTx(
  config: OperatorConfig,
  strategy: HedgedPlpStrategyState,
  oracleId: string,
  sender: string
) {
  const tx = new Transaction()
  tx.setSender(sender)
  tx.moveCall({
    target: target(config, "settle_round"),
    typeArguments: [config.predict.quoteAsset],
    arguments: [
      tx.object(config.hedgedPlp.strategyId),
      tx.object(config.hedgedPlp.keeperCapId),
      tx.object(config.predict.sharedObjectId),
      tx.object(strategy.managerId),
      tx.object(oracleId),
      tx.object(config.predict.clockObjectId),
    ],
  })

  return tx
}

function buildRealizeRoundTx(config: OperatorConfig, sender: string) {
  const tx = new Transaction()
  tx.setSender(sender)
  tx.moveCall({
    target: target(config, "realize_round"),
    typeArguments: [config.predict.quoteAsset],
    arguments: [
      tx.object(config.hedgedPlp.strategyId),
      tx.object(config.baseVault.vaultId),
      tx.object(config.hedgedPlp.keeperCapId),
      tx.object(config.predict.sharedObjectId),
      tx.object(config.predict.clockObjectId),
    ],
  })

  return tx
}

function logHedgedPlpStatus(strategy: HedgedPlpStrategyState) {
  console.log(
    JSON.stringify(
      {
        activeRound: strategy.activeRound
          ? {
              hedgeQuantity: strategy.activeRound.hedgeQuantity.toString(),
              oracleId: strategy.activeRound.oracleId,
              settled: strategy.activeRound.settled,
              strike: strategy.activeRound.strike.toString(),
            }
          : null,
        cash: strategy.cash.toString(),
        baseShares: strategy.baseShares.toString(),
        baseVaultId: strategy.baseVaultId,
        managerId: strategy.managerId,
        nav: strategy.nav.toString(),
        paused: strategy.paused,
        plpAmount: strategy.plpAmount.toString(),
        plpCostBasis: strategy.plpCostBasis.toString(),
        strategy: "hedged_plp",
        strategyId: strategy.strategyId,
      },
      null,
      2
    )
  )
}

function summarizeEvents(events: ReturnType<typeof eventJson>[]) {
  return events.filter((event) => event !== undefined)
}

async function maybeExecute(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
  label: string,
  dryRun: boolean
) {
  const simulation = await simulateTransaction(client, tx)

  if (!simulation.ok) {
    console.log(`[hedged_plp] ${label} simulation failed: ${simulation.error}`)
    return
  }

  if (dryRun) {
    console.log(`[hedged_plp] ${label} dry-run ok`)
    return
  }

  const executed = await executeTransaction(client, keypair, tx)
  console.log(`[hedged_plp] ${label} executed digest=${executed.digest}`)
  const events = summarizeEvents(executed.events.map(eventJson))

  if (events.length > 0) {
    console.log(`[hedged_plp] ${label} events=${JSON.stringify(events)}`)
  }
}

async function startHedgedPlpRound(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  strategy: HedgedPlpStrategyState,
  dryRun: boolean
) {
  if (strategy.paused) {
    console.log("[hedged_plp] start skipped: strategy paused")
    return
  }

  if (strategy.nav <= 0n) {
    console.log("[hedged_plp] start skipped: empty strategy")
    return
  }

  const oracle = await soonestEligibleOracle(config.predict, config.minHorizonMs)

  if (!oracle) {
    console.log("[hedged_plp] start skipped: no eligible active oracle")
    return
  }

  const state = await getOracleState(config.predict, oracle.oracleId)
  const spot = state.latestPrice?.spot

  if (!spot) {
    console.log(`[hedged_plp] start skipped: oracle ${oracle.oracleId} has no latest spot`)
    return
  }

  const strike = chooseDownsideStrike(oracle, spot, config.hedgedPlp.strikeSpotBps)
  const quantity = bpsAmount(strategy.nav, config.hedgedPlp.hedgeQuantityBpsOfNav)

  if (quantity <= 0n) {
    console.log("[hedged_plp] start skipped: computed hedge quantity is zero")
    return
  }

  console.log(
    `[hedged_plp] start candidate oracle=${oracle.oracleId} expiry=${oracle.expiryMs} spot=${spot} strike=${strike} quantity=${quantity}`
  )
  await maybeExecute(
    client,
    keypair,
    buildStartRoundTx(
      config,
      strategy,
      oracle,
      strike,
      quantity,
      keypair.toSuiAddress()
    ),
    "start_round",
    dryRun
  )
}

async function settleHedgedPlpRound(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  strategy: HedgedPlpStrategyState,
  dryRun: boolean
) {
  const round = strategy.activeRound

  if (!round) {
    console.log("[hedged_plp] settle skipped: no active round")
    return
  }

  if (round.settled) {
    console.log("[hedged_plp] settle skipped: round already settled")
    return
  }

  const oracle = await findOracle(config.predict, round.oracleId)

  if (!oracle || oracle.status !== "settled") {
    console.log(
      `[hedged_plp] settle skipped: oracle ${round.oracleId} status=${oracle?.status ?? "unknown"}`
    )
    return
  }

  await maybeExecute(
    client,
    keypair,
    buildSettleRoundTx(config, strategy, round.oracleId, keypair.toSuiAddress()),
    "settle_round",
    dryRun
  )
}

async function realizeHedgedPlpRound(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  strategy: HedgedPlpStrategyState,
  dryRun: boolean
) {
  const round = strategy.activeRound

  if (!round) {
    console.log("[hedged_plp] realize skipped: no active round")
    return
  }

  if (!round.settled) {
    console.log("[hedged_plp] realize skipped: round not settled")
    return
  }

  await maybeExecute(
    client,
    keypair,
    buildRealizeRoundTx(config, keypair.toSuiAddress()),
    "realize_round",
    dryRun
  )
}

export async function runHedgedPlpTick(
  client: SuiClient,
  keypair: Ed25519Keypair | undefined,
  config: OperatorConfig,
  options: HedgedPlpTickOptions
) {
  assertConfigured("Hedged PLP", {
    BASE_VAULT_ID: config.baseVault.vaultId,
    BASE_VAULT_PACKAGE_ID: config.baseVault.packageId,
    HEDGED_PLP_STRATEGY_PACKAGE_ID: config.hedgedPlp.packageId,
    HEDGED_PLP_KEEPER_CAP_ID: config.hedgedPlp.keeperCapId,
    HEDGED_PLP_MANAGER_ID: config.hedgedPlp.managerId,
    HEDGED_PLP_STRATEGY_ID: config.hedgedPlp.strategyId,
  })

  const strategy = await readHedgedPlpStrategy(
    client,
    config.hedgedPlp.strategyId,
    config.baseVault.vaultId
  )

  if (strategy.baseVaultId !== config.baseVault.vaultId) {
    throw new Error(
      `BASE_VAULT_ID mismatch: config=${config.baseVault.vaultId} strategy=${strategy.baseVaultId}`
    )
  }

  if (strategy.managerId !== config.hedgedPlp.managerId) {
    throw new Error(
      `HEDGED_PLP_MANAGER_ID mismatch: config=${config.hedgedPlp.managerId} strategy=${strategy.managerId}`
    )
  }

  if (options.action === "status") {
    logHedgedPlpStatus(strategy)
    return
  }

  if (!keypair) {
    throw new Error("SUI_KEEPER_KEY is required for Hedged PLP transaction actions")
  }

  if (options.action === "start") {
    await startHedgedPlpRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  if (options.action === "settle") {
    await settleHedgedPlpRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  if (options.action === "realize") {
    await realizeHedgedPlpRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  if (!strategy.activeRound) {
    await startHedgedPlpRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  if (!strategy.activeRound.settled) {
    await settleHedgedPlpRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  await realizeHedgedPlpRound(client, keypair, config, strategy, options.dryRun)
}
