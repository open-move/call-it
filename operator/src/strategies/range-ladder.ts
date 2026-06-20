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
  readRangeLadderStrategy,
  type RangeLadderStrategyState,
} from "../strategy-state.ts"

type RangeLadderAction = "auto" | "settle" | "start" | "status"

interface RangeLadderTickOptions {
  action: RangeLadderAction
  dryRun: boolean
}

interface RungPlan {
  higherStrike: bigint
  lowerStrike: bigint
  quantity: bigint
}

function target(config: OperatorConfig, functionName: string) {
  return `${config.rangeLadder.packageId}::range_ladder_strategy::${functionName}`
}

function policyTarget(config: OperatorConfig, functionName: string) {
  return `${config.rangeLadder.packageId}::policy::${functionName}`
}

function rangeRungType(config: OperatorConfig) {
  return `${config.rangeLadder.packageId}::policy::RangeRung`
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

function ceilToGrid(value: bigint, min: bigint, tick: bigint) {
  const floored = floorToGrid(value, min, tick)

  return floored === value ? floored : floored + tick
}

function planRungs(
  oracle: OracleInfo,
  spot: bigint,
  nav: bigint,
  config: OperatorConfig
): RungPlan[] {
  const rungCount = Math.trunc(config.rangeLadder.rungCount)

  if (rungCount <= 0) {
    throw new Error("RANGE_RUNG_COUNT must be positive")
  }

  const totalQuantity = bpsAmount(nav, config.rangeLadder.quantityBpsOfNav)
  const quantity = totalQuantity / BigInt(rungCount)

  if (quantity <= 0n) {
    throw new Error("computed Range Ladder rung quantity is zero")
  }

  const rungs: RungPlan[] = []

  for (let index = 1; index <= rungCount; index += 1) {
    const widthBps = BigInt(Math.trunc(config.rangeLadder.rungWidthBps * index))
    const lowerTarget = spot - (spot * widthBps) / 10_000n
    const higherTarget = spot + (spot * widthBps) / 10_000n
    const lowerStrike = floorToGrid(lowerTarget, oracle.minStrike, oracle.tickSize)
    const higherStrike = ceilToGrid(higherTarget, oracle.minStrike, oracle.tickSize)

    if (lowerStrike >= higherStrike) {
      throw new Error("computed invalid Range Ladder rung")
    }

    rungs.push({ higherStrike, lowerStrike, quantity })
  }

  return rungs
}

function buildStartRoundTx(
  config: OperatorConfig,
  strategy: RangeLadderStrategyState,
  oracle: OracleInfo,
  rungs: RungPlan[],
  sender: string
) {
  const tx = new Transaction()
  tx.setSender(sender)
  const rungValues = rungs.map((rung) =>
    tx.moveCall({
      target: policyTarget(config, "new_rung"),
      arguments: [
        tx.pure.u64(rung.lowerStrike),
        tx.pure.u64(rung.higherStrike),
        tx.pure.u64(rung.quantity),
      ],
    })
  )
  const rungVector = tx.makeMoveVec({
    elements: rungValues,
    type: rangeRungType(config),
  })

  tx.moveCall({
    target: target(config, "start_round"),
    typeArguments: [config.predict.quoteAsset],
    arguments: [
      tx.object(config.rangeLadder.strategyId),
      tx.object(config.baseVault.vaultId),
      tx.object(config.rangeLadder.capId),
      tx.object(config.predict.sharedObjectId),
      tx.object(strategy.managerId),
      tx.object(oracle.oracleId),
      rungVector,
      tx.object(config.predict.clockObjectId),
    ],
  })

  return tx
}

function buildSettleRoundTx(
  config: OperatorConfig,
  strategy: RangeLadderStrategyState,
  oracleId: string,
  sender: string
) {
  const tx = new Transaction()
  tx.setSender(sender)
  tx.moveCall({
    target: target(config, "settle_round"),
    typeArguments: [config.predict.quoteAsset],
    arguments: [
      tx.object(config.rangeLadder.strategyId),
      tx.object(config.baseVault.vaultId),
      tx.object(config.rangeLadder.capId),
      tx.object(config.predict.sharedObjectId),
      tx.object(strategy.managerId),
      tx.object(oracleId),
      tx.object(config.predict.clockObjectId),
    ],
  })

  return tx
}

function logRangeLadderStatus(strategy: RangeLadderStrategyState) {
  console.log(
    JSON.stringify(
      {
        activeRound: strategy.activeRound,
        baseShares: strategy.baseShares.toString(),
        baseVaultId: strategy.baseVaultId,
        cash: strategy.cash.toString(),
        managerId: strategy.managerId,
        nav: strategy.nav.toString(),
        paused: strategy.paused,
        strategy: "range_ladder",
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
    console.log(`[range_ladder] ${label} simulation failed: ${simulation.error}`)
    return
  }

  if (dryRun) {
    console.log(`[range_ladder] ${label} dry-run ok`)
    return
  }

  const executed = await executeTransaction(client, keypair, tx)
  console.log(`[range_ladder] ${label} executed digest=${executed.digest}`)
  const events = summarizeEvents(executed.events.map(eventJson))

  if (events.length > 0) {
    console.log(`[range_ladder] ${label} events=${JSON.stringify(events)}`)
  }
}

async function startRangeLadderRound(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  strategy: RangeLadderStrategyState,
  dryRun: boolean
) {
  if (strategy.paused) {
    console.log("[range_ladder] start skipped: strategy paused")
    return
  }

  if (strategy.nav <= 0n) {
    console.log("[range_ladder] start skipped: empty strategy")
    return
  }

  const oracle = await soonestEligibleOracle(config.predict, config.minHorizonMs)

  if (!oracle) {
    console.log("[range_ladder] start skipped: no eligible active oracle")
    return
  }

  const state = await getOracleState(config.predict, oracle.oracleId)
  const spot = state.latestPrice?.spot

  if (!spot) {
    console.log(
      `[range_ladder] start skipped: oracle ${oracle.oracleId} has no latest spot`
    )
    return
  }

  let rungs: RungPlan[]

  try {
    rungs = planRungs(oracle, spot, strategy.nav, config)
  } catch (error) {
    console.log(
      `[range_ladder] start skipped: ${error instanceof Error ? error.message : String(error)}`
    )
    return
  }

  console.log(
    `[range_ladder] start candidate oracle=${oracle.oracleId} expiry=${oracle.expiryMs} spot=${spot} rungs=${JSON.stringify(
      rungs.map((rung) => ({
        higherStrike: rung.higherStrike.toString(),
        lowerStrike: rung.lowerStrike.toString(),
        quantity: rung.quantity.toString(),
      }))
    )}`
  )
  await maybeExecute(
    client,
    keypair,
    buildStartRoundTx(config, strategy, oracle, rungs, keypair.toSuiAddress()),
    "start_round",
    dryRun
  )
}

async function settleRangeLadderRound(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  strategy: RangeLadderStrategyState,
  dryRun: boolean
) {
  const round = strategy.activeRound

  if (!round) {
    console.log("[range_ladder] settle skipped: no active round")
    return
  }

  const oracle = await findOracle(config.predict, round.oracleId)

  if (!oracle || oracle.status !== "settled") {
    console.log(
      `[range_ladder] settle skipped: oracle ${round.oracleId} status=${oracle?.status ?? "unknown"}`
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

export async function runRangeLadderTick(
  client: SuiClient,
  keypair: Ed25519Keypair | undefined,
  config: OperatorConfig,
  options: RangeLadderTickOptions
) {
  assertConfigured("Range Ladder", {
    BASE_VAULT_ID: config.baseVault.vaultId,
    BASE_VAULT_PACKAGE_ID: config.baseVault.packageId,
    RANGE_LADDER_CAP_ID: config.rangeLadder.capId,
    RANGE_LADDER_MANAGER_ID: config.rangeLadder.managerId,
    RANGE_LADDER_STRATEGY_PACKAGE_ID: config.rangeLadder.packageId,
    RANGE_LADDER_STRATEGY_ID: config.rangeLadder.strategyId,
  })

  const strategy = await readRangeLadderStrategy(
    client,
    config.rangeLadder.strategyId,
    config.baseVault.vaultId
  )

  if (strategy.baseVaultId !== config.baseVault.vaultId) {
    throw new Error(
      `BASE_VAULT_ID mismatch: config=${config.baseVault.vaultId} strategy=${strategy.baseVaultId}`
    )
  }

  if (strategy.managerId !== config.rangeLadder.managerId) {
    throw new Error(
      `RANGE_LADDER_MANAGER_ID mismatch: config=${config.rangeLadder.managerId} strategy=${strategy.managerId}`
    )
  }

  if (options.action === "status") {
    logRangeLadderStatus(strategy)
    return
  }

  if (!keypair) {
    throw new Error("SUI_KEEPER_KEY is required for Range Ladder transaction actions")
  }

  if (options.action === "start") {
    await startRangeLadderRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  if (options.action === "settle") {
    await settleRangeLadderRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  if (!strategy.activeRound) {
    await startRangeLadderRound(client, keypair, config, strategy, options.dryRun)
    return
  }

  await settleRangeLadderRound(client, keypair, config, strategy, options.dryRun)
}
