import { Transaction } from "@mysten/sui/transactions"

import type { OperatorConfig } from "../config.ts"
import { planRungs, type RungPlan } from "../grid.ts"
import { toLogFields } from "../logger.ts"
import type { OracleInfo } from "../predict.ts"
import { simulateTransaction } from "../sui.ts"
import { readRangeLadderStrategy, type RangeLadderStrategyState } from "../strategy-state.ts"
import { isAskOutOfMintableBounds, isQuoteUnavailable } from "../strategy/abort-codes.ts"
import type { StartCandidate, StartContext, StrategyDriver, StrategyStep } from "../strategy/engine.ts"

function target(config: OperatorConfig, functionName: string) {
  return `${config.rangeLadder.packageId}::strategy::${functionName}`
}

function policyTarget(config: OperatorConfig, functionName: string) {
  return `${config.rangeLadder.packageId}::policy::${functionName}`
}

function rangeRungType(config: OperatorConfig) {
  return `${config.rangeLadder.packageId}::policy::Rung`
}

function uniqueDescending(values: number[]) {
  return [...new Set(values.map((value) => Math.trunc(value)).filter((value) => value > 0))].sort(
    (left, right) => right - left
  )
}

function rungCountCandidates(config: OperatorConfig) {
  const configured = Math.trunc(config.rangeLadder.rungCount)
  const out: number[] = []
  for (let count = configured; count >= 1; count -= 1) {
    out.push(count)
  }
  return out
}

function rungWidthCandidates(config: OperatorConfig) {
  return uniqueDescending([config.rangeLadder.rungWidthBps, 500, 400, 300, 250, 200, 150, 100, 50, 20, 10])
}

function buildStartRoundTx(
  config: OperatorConfig,
  state: RangeLadderStrategyState,
  oracle: OracleInfo,
  rungs: RungPlan[],
  sender: string
) {
  const tx = new Transaction()
  tx.setSender(sender)
  const rungValues = rungs.map((rung) =>
    tx.moveCall({
      target: policyTarget(config, "new_rung"),
      arguments: [tx.pure.u64(rung.lowerStrike), tx.pure.u64(rung.higherStrike), tx.pure.u64(rung.quantity)],
    })
  )
  const rungVector = tx.makeMoveVec({ elements: rungValues, type: rangeRungType(config) })

  tx.moveCall({
    target: target(config, "start_round"),
    typeArguments: [config.predict.quoteAsset],
    arguments: [
      tx.object(config.rangeLadder.strategyId),
      tx.object(config.baseVault.vaultId),
      tx.object(config.rangeLadder.keeperCapId),
      tx.object(config.predict.sharedObjectId),
      tx.object(state.managerId),
      tx.object(oracle.oracleId),
      rungVector,
      tx.object(config.predict.clockObjectId),
    ],
  })

  return tx
}

export const rangeLadderDriver: StrategyDriver<RangeLadderStrategyState> = {
  kind: "range_ladder",

  readState(client, config) {
    return readRangeLadderStrategy(client, config.rangeLadder.strategyId, config.baseVault.vaultId)
  },

  validate(state, config) {
    if (state.baseVaultId !== config.baseVault.vaultId) {
      throw new Error(`base vault mismatch: config=${config.baseVault.vaultId} strategy=${state.baseVaultId}`)
    }
    if (state.managerId !== config.rangeLadder.managerId) {
      throw new Error(`range_ladder manager mismatch: config=${config.rangeLadder.managerId} strategy=${state.managerId}`)
    }
  },

  statusFields(state) {
    return {
      activeRound: state.activeRound,
      baseShares: state.baseShares,
      baseVaultId: state.baseVaultId,
      managerId: state.managerId,
      nav: state.nav,
      paused: state.paused,
      strategyId: state.strategyId,
    }
  },

  isPaused: (state) => state.paused,
  nav: (state) => state.nav,
  activeRoundOracleId: (state) => state.activeRound?.oracleId ?? null,
  // Range rounds have no per-round settled flag; the oracle settled-status gate
  // in the engine governs settlement.
  isRoundSettled: () => false,

  nextAction(state): StrategyStep {
    return state.activeRound ? "settle" : "start"
  },

  async selectStartCandidate(context, state): Promise<StartCandidate | undefined> {
    const { client, config, log, oracle, sender, spot } = context

    for (const rungCount of rungCountCandidates(config)) {
      for (const rungWidthBps of rungWidthCandidates(config)) {
        let rungs: RungPlan[]
        try {
          rungs = planRungs(oracle, spot, state.nav, {
            quantityBpsOfNav: config.rangeLadder.quantityBpsOfNav,
            rungCount,
            rungWidthBps,
          })
        } catch (error) {
          log.info(
            { error: error instanceof Error ? error.message : String(error), rungCount, rungWidthBps },
            "start candidate skipped: invalid rung plan"
          )
          continue
        }

        const transaction = buildStartRoundTx(config, state, oracle, rungs, sender)
        const simulation = await simulateTransaction(client, transaction)
        const logFields = {
          expiryMs: oracle.expiryMs,
          oracleId: oracle.oracleId,
          rungs: rungs.map((rung) => ({
            higherStrike: rung.higherStrike,
            lowerStrike: rung.lowerStrike,
            quantity: rung.quantity,
          })),
          spot,
        }

        if (simulation.ok || !(isQuoteUnavailable(simulation.error) || isAskOutOfMintableBounds(simulation.error))) {
          return { logFields, simulation, transaction }
        }

        log.info(toLogFields({ rungCount, rungWidthBps }), "start candidate skipped: quote unavailable")
      }
    }

    return undefined
  },

  buildSettleTx(config, state, oracleId, sender) {
    const tx = new Transaction()
    tx.setSender(sender)
    tx.moveCall({
      target: target(config, "settle_round"),
      typeArguments: [config.predict.quoteAsset],
      arguments: [
        tx.object(config.rangeLadder.strategyId),
        tx.object(config.baseVault.vaultId),
        tx.object(config.rangeLadder.keeperCapId),
        tx.object(config.predict.sharedObjectId),
        tx.object(state.managerId),
        tx.object(oracleId),
        tx.object(config.predict.clockObjectId),
      ],
    })
    return tx
  },
}
