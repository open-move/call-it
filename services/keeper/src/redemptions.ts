import type { Config } from "./config.ts"
import type { PositionState } from "./db/database.ts"
import { makeLocalTxId } from "./db/database.ts"
import type { Repository } from "./db/repo.ts"
import { logger } from "./logger.ts"
import { expectedSettledPayout } from "./predict.ts"
import type { SuiClient } from "./sui.ts"
import { buildRedeemTransaction, executeRedeem, getSuiBalance, loadRedeemKeypair, simulateRedeem } from "./sui.ts"

export interface RedemptionPlan {
  expectedPayout: bigint
  position: PositionState
  quantity: bigint
}

export interface RedeemResult {
  dryRun: boolean
  failed: number
  skipped: number
  submitted: number
}

// Coin-type strings differ only by the leading `0x` on the address (and case):
// the indexed `quote_asset` omits it, config includes it. Normalize before
// comparing. (The DUSDC address is already full-width, so stripping `0x` suffices.)
function normalizeCoinType(type: string): string {
  return type.replace(/^0x/i, "").toLowerCase()
}

export async function planRedemptions(config: Config, repo: Repository) {
  const positions = await repo.listOpenSettledPositions()
  const resolvedKeys = await repo.listResolvedPositionKeys()
  const plans: RedemptionPlan[] = []

  for (const position of positions) {
    // Indexed positions store the coin type without the `0x` address prefix that
    // config carries, so compare normalized forms — otherwise the mismatch would
    // skip every position (including winners that should be redeemed).
    if (normalizeCoinType(position.quoteAsset) !== normalizeCoinType(config.predictQuoteAsset)) {
      continue
    }

    // Already submitted/succeeded; awaiting its PositionRedeemed event.
    if (resolvedKeys.has(position.key)) {
      continue
    }

    const expectedPayout = expectedSettledPayout(position)
    if (expectedPayout < config.minPayout) {
      continue
    }

    plans.push({
      expectedPayout,
      position,
      quantity: position.openQty,
    })

    if (plans.length >= config.maxBatchSize) {
      break
    }
  }

  return plans
}

export async function executeRedemptions(
  config: Config,
  client: SuiClient,
  repo: Repository,
  plans: RedemptionPlan[]
): Promise<RedeemResult> {
  if (plans.length === 0) {
    return { dryRun: config.dryRun, failed: 0, skipped: 0, submitted: 0 }
  }

  if (config.dryRun) {
    for (const plan of plans) {
      await repo.recordTx({
        digest: makeLocalTxId("dry_run", plan.position.key),
        expectedPayout: plan.expectedPayout,
        managerId: plan.position.managerId,
        oracleId: plan.position.oracleId,
        positionKey: plan.position.key,
        quantity: plan.quantity,
        status: "dry_run",
      })
    }
    return { dryRun: true, failed: 0, skipped: 0, submitted: plans.length }
  }

  const signer = loadRedeemKeypair(config)
  const keeperAddress = signer.toSuiAddress()

  const balance = await getSuiBalance(client, keeperAddress)
  if (balance < config.minSuiBalance) {
    logger.warn(
      {
        balance: balance.toString(),
        keeperAddress,
        minSuiBalance: config.minSuiBalance.toString(),
      },
      "keeper SUI balance below minimum; skipping redemptions this tick"
    )
    return { dryRun: false, failed: 0, skipped: plans.length, submitted: 0 }
  }

  let submitted = 0
  let failed = 0

  const rewardConfigured = config.rewardVaultId !== null && config.rewardPackageId !== null

  for (const plan of plans) {
    // Prefer the reward vault, but fall back to a plain redeem when it can't pay
    // (manager not allow-listed, vault underfunded, payout below the vault's
    // minimum). Redeeming the position is the priority; the tip is a bonus.
    let transaction = buildRedeemTransaction(config, plan, keeperAddress, rewardConfigured)
    let simulation = await simulateRedeem(client, transaction)
    if (!simulation.ok && rewardConfigured) {
      logger.info(
        { error: simulation.error, positionKey: plan.position.key },
        "reward redeem unavailable; falling back to plain redeem"
      )
      transaction = buildRedeemTransaction(config, plan, keeperAddress, false)
      simulation = await simulateRedeem(client, transaction)
    }
    if (!simulation.ok) {
      failed += 1
      await repo.recordTx({
        digest: makeLocalTxId("sim_failed", plan.position.key),
        error: simulation.error ?? "Simulation failed",
        expectedPayout: plan.expectedPayout,
        managerId: plan.position.managerId,
        oracleId: plan.position.oracleId,
        positionKey: plan.position.key,
        quantity: plan.quantity,
        status: "sim_failed",
      })
      continue
    }

    try {
      const result = await executeRedeem(client, signer, transaction)
      submitted += 1
      await repo.recordTx({
        digest: result.digest,
        expectedPayout: plan.expectedPayout,
        managerId: plan.position.managerId,
        oracleId: plan.position.oracleId,
        positionKey: plan.position.key,
        quantity: plan.quantity,
        status: "succeeded",
      })
    } catch (error) {
      failed += 1
      await repo.recordTx({
        digest: makeLocalTxId("failed", plan.position.key),
        error: error instanceof Error ? error.message : "Transaction failed",
        expectedPayout: plan.expectedPayout,
        managerId: plan.position.managerId,
        oracleId: plan.position.oracleId,
        positionKey: plan.position.key,
        quantity: plan.quantity,
        status: "failed",
      })
    }
  }

  return { dryRun: false, failed, skipped: 0, submitted }
}
