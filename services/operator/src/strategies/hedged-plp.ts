import { Transaction } from "@mysten/sui/transactions"

import type { OperatorConfig } from "../config.ts"
import { bpsAmount, chooseDownsideStrike } from "../grid.ts"
import { toLogFields } from "../logger.ts"
import type { OracleInfo } from "../predict.ts"
import { simulateTransaction } from "../sui.ts"
import { readHedgedPlpStrategy, type HedgedPlpStrategyState } from "../strategy-state.ts"
import { isAskOutOfMintableBounds } from "../strategy/abort-codes.ts"
import type { StartCandidate, StartContext, StrategyDriver, StrategyStep } from "../strategy/engine.ts"

function target(config: OperatorConfig, functionName: string) {
  return `${config.hedgedPlp.packageId}::strategy::${functionName}`
}

// Strike candidates: walk from the configured strike/spot ratio toward (but not
// reaching) spot, coarse by 10bps then fine by 1bps near the top of the band.
function hedgeStrikeBpsCandidates(strikeSpotBps: number) {
  const start = Math.min(Math.max(Math.trunc(strikeSpotBps), 1), 9_999)
  const out: number[] = []

  for (let bps = start; bps <= 9_990; bps += 10) {
    out.push(bps)
  }
  for (let bps = Math.max(start, 9_991); bps <= 9_999; bps += 1) {
    out.push(bps)
  }

  return out
}

function buildStartRoundTx(
  config: OperatorConfig,
  state: HedgedPlpStrategyState,
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
      tx.object(state.managerId),
      tx.object(oracle.oracleId),
      tx.pure.u64(strike),
      tx.pure.u64(quantity),
      tx.object(config.predict.clockObjectId),
    ],
  })

  return tx
}

export const hedgedPlpDriver: StrategyDriver<HedgedPlpStrategyState> = {
  kind: "hedged_plp",

  readState(client, config) {
    return readHedgedPlpStrategy(client, config.hedgedPlp.strategyId, config.baseVault.vaultId)
  },

  validate(state, config) {
    if (state.baseVaultId !== config.baseVault.vaultId) {
      throw new Error(`base vault mismatch: config=${config.baseVault.vaultId} strategy=${state.baseVaultId}`)
    }
    if (state.managerId !== config.hedgedPlp.managerId) {
      throw new Error(`hedged_plp manager mismatch: config=${config.hedgedPlp.managerId} strategy=${state.managerId}`)
    }
  },

  statusFields(state) {
    return {
      activeRound: state.activeRound
        ? {
            hedgeQuantity: state.activeRound.hedgeQuantity,
            oracleId: state.activeRound.oracleId,
            settled: state.activeRound.settled,
            strike: state.activeRound.strike,
          }
        : null,
      baseShares: state.baseShares,
      baseVaultId: state.baseVaultId,
      cash: state.cash,
      managerId: state.managerId,
      nav: state.nav,
      paused: state.paused,
      plpAmount: state.plpAmount,
      plpCostBasis: state.plpCostBasis,
      strategyId: state.strategyId,
    }
  },

  isPaused: (state) => state.paused,
  nav: (state) => state.nav,
  activeRoundOracleId: (state) => state.activeRound?.oracleId ?? null,
  isRoundSettled: (state) => state.activeRound?.settled ?? false,

  nextAction(state): StrategyStep {
    if (!state.activeRound) {
      return "start"
    }
    if (!state.activeRound.settled) {
      return "settle"
    }
    return "realize"
  },

  async selectStartCandidate(context, state): Promise<StartCandidate | undefined> {
    const { client, config, log, oracle, sender, spot } = context

    const quantity = bpsAmount(state.nav, config.hedgedPlp.hedgeQuantityBpsOfNav)
    if (quantity <= 0n) {
      log.info("start skipped: computed hedge quantity is zero")
      return undefined
    }

    const triedStrikes = new Set<string>()
    for (const strikeBps of hedgeStrikeBpsCandidates(config.hedgedPlp.strikeSpotBps)) {
      const strike = chooseDownsideStrike(oracle, spot, strikeBps)
      const strikeKey = strike.toString()
      if (triedStrikes.has(strikeKey)) {
        continue
      }
      triedStrikes.add(strikeKey)

      const transaction = buildStartRoundTx(config, state, oracle, strike, quantity, sender)
      const simulation = await simulateTransaction(client, transaction)
      const logFields = { expiryMs: oracle.expiryMs, oracleId: oracle.oracleId, quantity, spot, strike }

      if (simulation.ok || !isAskOutOfMintableBounds(simulation.error)) {
        return { logFields, simulation, transaction }
      }

      log.info(toLogFields({ bps: strikeBps, strike }), "start candidate skipped: ask outside mintable bounds")
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
        tx.object(config.hedgedPlp.strategyId),
        tx.object(config.hedgedPlp.keeperCapId),
        tx.object(config.predict.sharedObjectId),
        tx.object(state.managerId),
        tx.object(oracleId),
        tx.object(config.predict.clockObjectId),
      ],
    })
    return tx
  },

  buildRealizeTx(config, _state, sender) {
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
  },
}
