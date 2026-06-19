import { Transaction } from "@mysten/sui/transactions"
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"

import { assertConfigured, type OperatorConfig } from "./config.ts"
import {
  findOracle,
  getOracleState,
  soonestEligibleOracle,
  type OracleInfo,
} from "./predict.ts"
import {
  executeTransaction,
  eventJson,
  simulateTransaction,
  type SuiClient,
} from "./sui.ts"
import { readShieldVault, type ShieldVaultState } from "./vault-state.ts"

type ShieldAction = "auto" | "realize" | "settle" | "start" | "status"

interface ShieldTickOptions {
  action: ShieldAction
  dryRun: boolean
}

function target(config: OperatorConfig, functionName: string) {
  return `${config.shield.packageId}::shield_vault::${functionName}`
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
  vault: ShieldVaultState,
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
      tx.object(config.shield.vaultId),
      tx.object(config.shield.capId),
      tx.object(config.predict.sharedObjectId),
      tx.object(vault.managerId),
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
  vault: ShieldVaultState,
  oracleId: string,
  sender: string
) {
  const tx = new Transaction()
  tx.setSender(sender)
  tx.moveCall({
    target: target(config, "settle_round"),
    typeArguments: [config.predict.quoteAsset],
    arguments: [
      tx.object(config.shield.vaultId),
      tx.object(config.shield.capId),
      tx.object(config.predict.sharedObjectId),
      tx.object(vault.managerId),
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
      tx.object(config.shield.vaultId),
      tx.object(config.shield.capId),
      tx.object(config.predict.sharedObjectId),
      tx.object(config.predict.clockObjectId),
    ],
  })

  return tx
}

function logShieldStatus(vault: ShieldVaultState) {
  console.log(
    JSON.stringify(
      {
        activeRound: vault.activeRound
          ? {
              hedgeQuantity: vault.activeRound.hedgeQuantity.toString(),
              oracleId: vault.activeRound.oracleId,
              settled: vault.activeRound.settled,
              strike: vault.activeRound.strike.toString(),
            }
          : null,
        cash: vault.cash.toString(),
        managerId: vault.managerId,
        nav: vault.nav.toString(),
        paused: vault.paused,
        plpAmount: vault.plpAmount.toString(),
        plpCostBasis: vault.plpCostBasis.toString(),
        vault: "shield",
        vaultId: vault.vaultId,
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
  vault: ShieldVaultState,
  dryRun: boolean
) {
  if (vault.paused) {
    console.log("[shield] start skipped: vault paused")
    return
  }

  if (vault.nav <= 0n) {
    console.log("[shield] start skipped: empty vault")
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
  const quantity = bpsAmount(vault.nav, config.shield.hedgeQuantityBpsOfNav)

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
      vault,
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
  vault: ShieldVaultState,
  dryRun: boolean
) {
  const round = vault.activeRound

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
    buildSettleRoundTx(config, vault, round.oracleId, keypair.toSuiAddress()),
    "settle_round",
    dryRun
  )
}

async function realizeShieldRound(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  vault: ShieldVaultState,
  dryRun: boolean
) {
  const round = vault.activeRound

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
    CALLIT_VAULTS_PACKAGE_ID: config.shield.packageId,
    SHIELD_CAP_ID: config.shield.capId,
    SHIELD_MANAGER_ID: config.shield.managerId,
    SHIELD_VAULT_ID: config.shield.vaultId,
  })

  const vault = await readShieldVault(client, config.shield.vaultId)

  if (vault.managerId !== config.shield.managerId) {
    throw new Error(
      `SHIELD_MANAGER_ID mismatch: config=${config.shield.managerId} vault=${vault.managerId}`
    )
  }

  if (options.action === "status") {
    logShieldStatus(vault)
    return
  }

  if (!keypair) {
    throw new Error("SUI_KEEPER_KEY is required for Shield transaction actions")
  }

  if (options.action === "start") {
    await startShieldRound(client, keypair, config, vault, options.dryRun)
    return
  }

  if (options.action === "settle") {
    await settleShieldRound(client, keypair, config, vault, options.dryRun)
    return
  }

  if (options.action === "realize") {
    await realizeShieldRound(client, keypair, config, vault, options.dryRun)
    return
  }

  if (!vault.activeRound) {
    await startShieldRound(client, keypair, config, vault, options.dryRun)
    return
  }

  if (!vault.activeRound.settled) {
    await settleShieldRound(client, keypair, config, vault, options.dryRun)
    return
  }

  await realizeShieldRound(client, keypair, config, vault, options.dryRun)
}
