import { Transaction } from "@mysten/sui/transactions"

import type { OperatorConfig } from "../config.ts"
import { bpsAmount, chooseUpsideStrike } from "../grid.ts"
import { toLogFields } from "../logger.ts"
import type { OracleInfo } from "../predict.ts"
import { simulateTransaction } from "../sui.ts"
import { readStrategyState, type StrategyState } from "../strategy-state.ts"
import { isAskOutOfMintableBounds } from "../strategy/abort-codes.ts"
import type { StartCandidate, StartContext, StrategyDriver, StrategyStep } from "../strategy/engine.ts"

function target(config: OperatorConfig, functionName: string) {
  return `${config.bullishUpside.packageId}::strategy::${functionName}`
}

// UP-binary strikes above spot, from the configured target inward toward spot.
// Closer to spot is more expensive; on an ask-out-of-bounds abort we step in.
function upStrikeBpsCandidates(strikeSpotBps: number): number[] {
  const start = Math.min(Math.max(Math.trunc(strikeSpotBps), 10_001), 19_999)
  const out: number[] = []
  for (let bps = start; bps >= 10_010; bps -= 10) {
    out.push(bps)
  }
  for (let bps = Math.min(start, 10_009); bps >= 10_001; bps -= 1) {
    out.push(bps)
  }
  return [...new Set(out)]
}

function buildStartRoundTx(
  config: OperatorConfig,
  state: StrategyState,
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
      tx.object(config.bullishUpside.strategyId),
      tx.object(config.baseVault.vaultId),
      tx.object(config.bullishUpside.keeperCapId),
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

export const bullishUpsideDriver: StrategyDriver<StrategyState> = {
  kind: "bullish_upside",

  readState(client, config) {
    return readStrategyState(client, config.bullishUpside.strategyId, config.baseVault.vaultId)
  },

  validate(state, config) {
    if (state.baseVaultId !== config.baseVault.vaultId) {
      throw new Error(`base vault mismatch: config=${config.baseVault.vaultId} strategy=${state.baseVaultId}`)
    }
    if (state.managerId !== config.bullishUpside.managerId) {
      throw new Error(`bullish_upside manager mismatch: config=${config.bullishUpside.managerId} strategy=${state.managerId}`)
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
  // Two-phase: settle_round consumes the round; no per-round settled flag.
  isRoundSettled: () => false,

  nextAction(state): StrategyStep {
    return state.activeRound ? "settle" : "start"
  },

  async selectStartCandidate(context, state): Promise<StartCandidate | undefined> {
    const { client, config, log, oracle, sender, spot } = context

    const quantity = bpsAmount(state.nav, config.bullishUpside.quantityBpsOfNav)
    if (quantity <= 0n) {
      log.info("start skipped: computed up quantity is zero")
      return undefined
    }

    const triedStrikes = new Set<string>()
    for (const strikeBps of upStrikeBpsCandidates(config.bullishUpside.strikeSpotBps)) {
      let strike: bigint
      try {
        strike = chooseUpsideStrike(oracle, spot, strikeBps)
      } catch (error) {
        log.info(
          { error: error instanceof Error ? error.message : String(error), strikeBps },
          "start candidate skipped: invalid strike"
        )
        continue
      }

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
        tx.object(config.bullishUpside.strategyId),
        tx.object(config.baseVault.vaultId),
        tx.object(config.bullishUpside.keeperCapId),
        tx.object(config.predict.sharedObjectId),
        tx.object(state.managerId),
        tx.object(oracleId),
        tx.object(config.predict.clockObjectId),
      ],
    })
    return tx
  },
}
