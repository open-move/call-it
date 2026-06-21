import type { KeeperConfig } from "./config.ts"
import type { PositionState } from "./db/database.ts"
import { makeLocalTxId } from "./db/database.ts"
import type { KeeperRepository } from "./db/repo.ts"
import { expectedSettledPayout } from "./predict.ts"
import type { KeeperSuiClient } from "./sui.ts"
import { buildRedeemTransaction, executeRedeem, loadRedeemKeypair, simulateRedeem } from "./sui.ts"

export interface RedemptionPlan {
  expectedPayout: bigint
  position: PositionState
  quantity: bigint
}

export interface RedeemResult {
  dryRun: boolean
  failed: number
  submitted: number
}

export async function planRedemptions(config: KeeperConfig, repo: KeeperRepository) {
  const positions = await repo.listOpenSettledPositions()
  const plans: RedemptionPlan[] = []

  for (const position of positions) {
    if (position.quoteAsset !== config.predictQuoteAsset) {
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
  config: KeeperConfig,
  client: KeeperSuiClient,
  repo: KeeperRepository,
  plans: RedemptionPlan[]
): Promise<RedeemResult> {
  if (plans.length === 0) {
    return { dryRun: config.dryRun, failed: 0, submitted: 0 }
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
    return { dryRun: true, failed: 0, submitted: plans.length }
  }

  const signer = loadRedeemKeypair(config)
  let submitted = 0
  let failed = 0

  for (const plan of plans) {
    const transaction = buildRedeemTransaction(config, plan)
    const simulation = await simulateRedeem(client, transaction)
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

  return { dryRun: false, failed, submitted }
}
