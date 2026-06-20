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
import { readShieldStrategy, type ShieldStrategyState } from "../strategy-state.ts"

type ShieldAction = "auto" | "realize" | "settle" | "start" | "status"

interface ShieldTickOptions {
  action: ShieldAction
  dryRun: boolean
}

function target(config: OperatorConfig, functionName: string) {
  return `${config.shield.packageId}::shield_strategy::${functionName}`
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
    throw new Error("computed Shield strike is outside oracle grid")
  }

  return strike
}

function buildStartRoundTx(
  config: OperatorConfig,
  strategy: ShieldStrategyState,
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
      tx.object(config.shield.strategyId),
      tx.object(config.baseVault.vaultId),
      tx.object(config.shield.capId),
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
  strategy: ShieldStrategyState,
  oracleId: string,
  sender: string
) {
  const tx = new Transaction()
  tx.setSender(sender)
  tx.moveCall({
    target: target(config, "settle_round"),
    typeArguments: [config.predict.quoteAsset],
    arguments: [
      tx.object(config.shield.strategyId),
      tx.object(config.shield.capId),
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
      tx.object(config.shield.strategyId),
      tx.object(config.baseVault.vaultId),
      tx.object(config.shield.capId),
      tx.object(config.predict.sharedObjectId),
      tx.object(config.predict.clockObjectId),
    ],
  })

  return tx
}

function logShieldStatus(strategy: ShieldStrategyState) {
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
        strategy: "shield",
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
    console.log(`[shield] ${label} simulation failed: ${simulation.error}`)
    return
  }

  if (dryRun) {
    console.log(`[shield] ${label} dry-run ok`)
    return
  }

  const executed = await executeTransaction(client, keypair, tx)
  console.log(`[shield] ${label} executed digest=${executed.digest}`)
  const events = summarizeEvents(executed.events.map(eventJson))

  if (events.length > 0) {
    console.log(`[shield] ${label} events=${JSON.stringify(events)}`)
  }
}

async function startShieldRound(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  strategy: ShieldStrategyState,
  dryRun: boolean
) {
  if (strategy.paused) {
    console.log("[shield] start skipped: strategy paused")
    return
  }

  if (strategy.nav <= 0n) {
    console.log("[shield] start skipped: empty strategy")
    return
  }

  const oracle = await soonestEligibleOracle(config.predict, config.minHorizonMs)

  if (!oracle) {
    console.log("[shield] start skipped: no eligible active oracle")
    return
  }

  const state = await getOracleState(config.predict, oracle.oracleId)
  const spot = state.latestPrice?.spot

  if (!spot) {
    console.log(`[shield] start skipped: oracle ${oracle.oracleId} has no latest spot`)
    return
  }

  const strike = chooseDownsideStrike(oracle, spot, config.shield.strikeSpotBps)
  const quantity = bpsAmount(strategy.nav, config.shield.hedgeQuantityBpsOfNav)

  if (quantity <= 0n) {
    console.log("[shield] start skipped: computed hedge quantity is zero")
    return
  }

  console.log(
    `[shield] start candidate oracle=${oracle.oracleId} expiry=${oracle.expiryMs} spot=${spot} strike=${strike} quantity=${quantity}`
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

async function settleShieldRound(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  strategy: ShieldStrategyState,
  dryRun: boolean
) {
  const round = strategy.activeRound

  if (!round) {
    console.log("[shield] settle skipped: no active round")
    return
  }

  if (round.settled) {
    console.log("[shield] settle skipped: round already settled")
    return
  }

  const oracle = await findOracle(config.predict, round.oracleId)

  if (!oracle || oracle.status !== "settled") {
    console.log(
      `[shield] settle skipped: oracle ${round.oracleId} status=${oracle?.status ?? "unknown"}`
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

async function realizeShieldRound(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  strategy: ShieldStrategyState,
  dryRun: boolean
) {
  const round = strategy.activeRound

  if (!round) {
    console.log("[shield] realize skipped: no active round")
    return
  }

  if (!round.settled) {
    console.log("[shield] realize skipped: round not settled")
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

export async function runShieldTick(
  client: SuiClient,
  keypair: Ed25519Keypair | undefined,
  config: OperatorConfig,
  options: ShieldTickOptions
) {
  assertConfigured("Shield", {
    BASE_VAULT_ID: config.baseVault.vaultId,
    BASE_VAULT_PACKAGE_ID: config.baseVault.packageId,
    SHIELD_STRATEGY_PACKAGE_ID: config.shield.packageId,
    SHIELD_CAP_ID: config.shield.capId,
    SHIELD_MANAGER_ID: config.shield.managerId,
    SHIELD_STRATEGY_ID: config.shield.strategyId,
  })

  const strategy = await readShieldStrategy(
    client,
    config.shield.strategyId,
    config.baseVault.vaultId
  )

  if (strategy.baseVaultId !== config.baseVault.vaultId) {
    throw new Error(
      `BASE_VAULT_ID mismatch: config=${config.baseVault.vaultId} strategy=${strategy.baseVaultId}`
    )
  }

  if (strategy.managerId !== config.shield.managerId) {
    throw new Error(
      `SHIELD_MANAGER_ID mismatch: config=${config.shield.managerId} strategy=${strategy.managerId}`
    )
  }

  if (options.action === "status") {
    logShieldStatus(strategy)
    return
  }

  if (!keypair) {
    throw new Error("SUI_KEEPER_KEY is required for Shield transaction actions")
  }

  if (options.action === "start") {
    await startShieldRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  if (options.action === "settle") {
    await settleShieldRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  if (options.action === "realize") {
    await realizeShieldRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  if (!strategy.activeRound) {
    await startShieldRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  if (!strategy.activeRound.settled) {
    await settleShieldRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  await realizeShieldRound(client, keypair, config, strategy, options.dryRun)
}
