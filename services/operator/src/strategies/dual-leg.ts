import { Transaction } from "@mysten/sui/transactions"

import type { DualLegConfig, OperatorConfig } from "../config.ts"
import { bpsAmount, chooseDownsideStrike, chooseUpsideStrike } from "../grid.ts"
import { toLogFields } from "../logger.ts"
import type { OracleInfo } from "../predict.ts"
import { simulateTransaction } from "../sui.ts"
import { readStrategyState, type StrategyState } from "../strategy-state.ts"
import { isAskOutOfMintableBounds, isQuoteUnavailable } from "../strategy/abort-codes.ts"
import type { StartCandidate, StartContext, StrategyDriver, StrategyStep } from "../strategy/engine.ts"

type ConfigSelector = (config: OperatorConfig) => DualLegConfig

// Symmetric strike widths around spot, narrow first then widening. A wider band
// is further out-of-the-money (cheaper, more likely mintable), so on an
// ask-out-of-bounds / quote-unavailable abort we retry wider.
function widthBpsCandidates(strikeWidthBps: number): number[] {
  const start = Math.min(Math.max(Math.trunc(strikeWidthBps), 10), 2_000)
  const widths = new Set<number>()
  for (let width = start; width <= 1_000; width += width < 200 ? 25 : 100) {
    widths.add(width)
  }
  return [...widths]
}

function buildStartRoundTx(
  packageId: string,
  config: OperatorConfig,
  cfg: DualLegConfig,
  state: StrategyState,
  oracle: OracleInfo,
  downStrike: bigint,
  upStrike: bigint,
  quantity: bigint,
  sender: string
) {
  const tx = new Transaction()
  tx.setSender(sender)
  tx.moveCall({
    target: `${packageId}::strategy::start_round`,
    typeArguments: [config.predict.quoteAsset],
    arguments: [
      tx.object(cfg.strategyId),
      tx.object(config.baseVault.vaultId),
      tx.object(cfg.keeperCapId),
      tx.object(config.predict.sharedObjectId),
      tx.object(state.managerId),
      tx.object(oracle.oracleId),
      tx.pure.u64(downStrike),
      tx.pure.u64(quantity),
      tx.pure.u64(upStrike),
      tx.pure.u64(quantity),
      tx.object(config.predict.clockObjectId),
    ],
  })
  return tx
}

/// Build a driver for a dual-leg strategy (a down leg below spot + an up leg
/// above spot). `strangle` and `plp_collar` share this exact call shape; PLP is
/// handled transparently by `readStrategyState` (it shows up in NAV).
export function createDualLegDriver(
  kind: string,
  select: ConfigSelector
): StrategyDriver<StrategyState> {
  return {
    kind,

    readState(client, config) {
      const cfg = select(config)
      return readStrategyState(client, cfg.strategyId, config.baseVault.vaultId)
    },

    validate(state, config) {
      const cfg = select(config)
      if (state.baseVaultId !== config.baseVault.vaultId) {
        throw new Error(`base vault mismatch: config=${config.baseVault.vaultId} strategy=${state.baseVaultId}`)
      }
      if (state.managerId !== cfg.managerId) {
        throw new Error(`${kind} manager mismatch: config=${cfg.managerId} strategy=${state.managerId}`)
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
        plpCostBasis: state.plpCostBasis,
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
      const cfg = select(config)

      const quantity = bpsAmount(state.nav, cfg.quantityBpsOfNav)
      if (quantity <= 0n) {
        log.info("start skipped: computed leg quantity is zero")
        return undefined
      }

      for (const widthBps of widthBpsCandidates(cfg.strikeWidthBps)) {
        let downStrike: bigint
        let upStrike: bigint
        try {
          downStrike = chooseDownsideStrike(oracle, spot, 10_000 - widthBps)
          upStrike = chooseUpsideStrike(oracle, spot, 10_000 + widthBps)
        } catch (error) {
          log.info(
            { error: error instanceof Error ? error.message : String(error), widthBps },
            "start candidate skipped: invalid strikes"
          )
          continue
        }

        const transaction = buildStartRoundTx(
          cfg.packageId,
          config,
          cfg,
          state,
          oracle,
          downStrike,
          upStrike,
          quantity,
          sender
        )
        const simulation = await simulateTransaction(client, transaction)
        const logFields = {
          downStrike,
          expiryMs: oracle.expiryMs,
          oracleId: oracle.oracleId,
          quantity,
          spot,
          upStrike,
          widthBps,
        }

        if (simulation.ok || !(isAskOutOfMintableBounds(simulation.error) || isQuoteUnavailable(simulation.error))) {
          return { logFields, simulation, transaction }
        }

        log.info(toLogFields({ downStrike, upStrike, widthBps }), "start candidate skipped: not mintable")
      }

      return undefined
    },

    buildSettleTx(config, state, oracleId, sender) {
      const cfg = select(config)
      const tx = new Transaction()
      tx.setSender(sender)
      tx.moveCall({
        target: `${cfg.packageId}::strategy::settle_round`,
        typeArguments: [config.predict.quoteAsset],
        arguments: [
          tx.object(cfg.strategyId),
          tx.object(config.baseVault.vaultId),
          tx.object(cfg.keeperCapId),
          tx.object(config.predict.sharedObjectId),
          tx.object(state.managerId),
          tx.object(oracleId),
          tx.object(config.predict.clockObjectId),
        ],
      })
      return tx
    },
  }
}
