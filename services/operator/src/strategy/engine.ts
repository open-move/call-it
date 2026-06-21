import type { Transaction } from "@mysten/sui/transactions"
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"
import type { Logger } from "pino"

import type { OperatorConfig } from "../config.ts"
import { logger, toLogFields } from "../logger.ts"
import { findOracle, getOracleState, selectRoundOracle, type OracleInfo } from "../predict.ts"
import {
  executeTransaction,
  eventJson,
  simulateTransaction,
  type SimulationResult,
  type SuiClient,
} from "../sui.ts"

export type TickAction = "auto" | "realize" | "settle" | "start" | "status"
export type StrategyStep = "none" | "realize" | "settle" | "start"

export interface TickOptions {
  action: TickAction
  dryRun: boolean
}

export interface StartContext {
  client: SuiClient
  config: OperatorConfig
  log: Logger
  oracle: OracleInfo
  sender: string
  spot: bigint
}

export interface StartCandidate {
  logFields: Record<string, unknown>
  simulation: SimulationResult
  transaction: Transaction
}

/// Per-strategy behavior. The engine owns the shared lifecycle (state read,
/// validation, action routing, simulate/execute, structured logging); a driver
/// supplies only what differs between strategies.
export interface StrategyDriver<State> {
  kind: string
  readState(client: SuiClient, config: OperatorConfig): Promise<State>
  /// Throw if on-chain state disagrees with config (base vault / manager).
  validate(state: State, config: OperatorConfig): void
  statusFields(state: State): Record<string, unknown>
  isPaused(state: State): boolean
  nav(state: State): bigint
  activeRoundOracleId(state: State): string | null
  isRoundSettled(state: State): boolean
  /// Which step `auto` should take given current state.
  nextAction(state: State): StrategyStep
  /// Search for an executable start_round transaction (already simulated).
  selectStartCandidate(context: StartContext, state: State): Promise<StartCandidate | undefined>
  buildSettleTx(config: OperatorConfig, state: State, oracleId: string, sender: string): Transaction
  /// Present only for strategies with a post-settlement realize step.
  buildRealizeTx?(config: OperatorConfig, state: State, sender: string): Transaction
}

export async function runStrategyTick<State>(
  driver: StrategyDriver<State>,
  client: SuiClient,
  keypair: Ed25519Keypair | undefined,
  config: OperatorConfig,
  options: TickOptions
): Promise<void> {
  const log = logger.child({ strategy: driver.kind })
  const state = await driver.readState(client, config)
  driver.validate(state, config)

  if (options.action === "status") {
    log.info(toLogFields(driver.statusFields(state)), "status")
    return
  }

  if (!keypair) {
    throw new Error(`SUI_KEEPER_KEY is required for ${driver.kind} transaction actions`)
  }

  const step: StrategyStep = options.action === "auto" ? driver.nextAction(state) : options.action

  if (step === "none") {
    log.info("auto: nothing to do")
    return
  }

  if (step === "start") {
    await runStart(driver, client, keypair, config, state, options.dryRun, log)
    return
  }

  if (step === "settle") {
    await runSettle(driver, client, keypair, config, state, options.dryRun, log)
    return
  }

  await runRealize(driver, client, keypair, config, state, options.dryRun, log)
}

async function runStart<State>(
  driver: StrategyDriver<State>,
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  state: State,
  dryRun: boolean,
  log: Logger
) {
  if (driver.isPaused(state)) {
    log.info("start skipped: strategy paused")
    return
  }
  if (driver.nav(state) <= 0n) {
    log.info("start skipped: empty strategy")
    return
  }

  const oracle = await selectRoundOracle(config.predict)
  if (!oracle) {
    log.info("start skipped: no eligible round oracle")
    return
  }

  const oracleState = await getOracleState(config.predict, oracle.oracleId)
  const spot = oracleState.latestPrice?.spot
  if (!spot) {
    log.info({ oracleId: oracle.oracleId }, "start skipped: oracle has no latest spot")
    return
  }

  const candidate = await driver.selectStartCandidate(
    { client, config, log, oracle, sender: keypair.toSuiAddress(), spot },
    state
  )
  if (!candidate) {
    log.info("start skipped: no executable candidate found")
    return
  }

  log.info(toLogFields(candidate.logFields), "start candidate")
  await finishExecute(client, keypair, candidate.transaction, candidate.simulation, "start_round", dryRun, log)
}

async function runSettle<State>(
  driver: StrategyDriver<State>,
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  state: State,
  dryRun: boolean,
  log: Logger
) {
  const oracleId = driver.activeRoundOracleId(state)
  if (!oracleId) {
    log.info("settle skipped: no active round")
    return
  }
  if (driver.isRoundSettled(state)) {
    log.info("settle skipped: round already settled")
    return
  }

  const oracle = await findOracle(config.predict, oracleId)
  if (!oracle || oracle.status !== "settled") {
    log.info({ oracleId, status: oracle?.status ?? "unknown" }, "settle skipped: oracle not settled")
    return
  }

  const tx = driver.buildSettleTx(config, state, oracleId, keypair.toSuiAddress())
  await maybeExecute(client, keypair, tx, "settle_round", dryRun, log)
}

async function runRealize<State>(
  driver: StrategyDriver<State>,
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: OperatorConfig,
  state: State,
  dryRun: boolean,
  log: Logger
) {
  if (!driver.buildRealizeTx) {
    log.info("realize not supported for this strategy")
    return
  }
  if (!driver.activeRoundOracleId(state)) {
    log.info("realize skipped: no active round")
    return
  }
  if (!driver.isRoundSettled(state)) {
    log.info("realize skipped: round not settled")
    return
  }

  const tx = driver.buildRealizeTx(config, state, keypair.toSuiAddress())
  await maybeExecute(client, keypair, tx, "realize_round", dryRun, log)
}

async function maybeExecute(
  client: SuiClient,
  keypair: Ed25519Keypair,
  transaction: Transaction,
  label: string,
  dryRun: boolean,
  log: Logger
) {
  const simulation = await simulateTransaction(client, transaction)
  await finishExecute(client, keypair, transaction, simulation, label, dryRun, log)
}

async function finishExecute(
  client: SuiClient,
  keypair: Ed25519Keypair,
  transaction: Transaction,
  simulation: SimulationResult,
  label: string,
  dryRun: boolean,
  log: Logger
) {
  if (!simulation.ok) {
    log.warn({ error: simulation.error }, `${label} simulation failed`)
    return
  }

  if (dryRun) {
    log.info(`${label} dry-run ok`)
    return
  }

  const executed = await executeTransaction(client, keypair, transaction)
  log.info({ digest: executed.digest }, `${label} executed`)

  const events = executed.events.map(eventJson).filter((event) => event !== undefined)
  if (events.length > 0) {
    log.info(toLogFields({ events }), `${label} events`)
  }
}
