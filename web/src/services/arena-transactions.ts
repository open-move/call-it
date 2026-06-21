import { Transaction } from "@mysten/sui/transactions"

import {
  ARENA_OBJECT_ID,
  ARENA_PACKAGE_ID,
  PREDICT_CLOCK_ID,
  PREDICT_OBJECT_ID,
  PREDICT_QUOTE_ASSET,
} from "@/lib/config"
import {
  buildQuoteCoin,
  executeSuiTransaction,
  toOnchainPrice,
  type ExecutedSuiTransaction,
  type SuiTransactionSigner,
} from "./predict-transactions"

const ARENA_MODULE = "arena"

function target(functionName: string) {
  return `${ARENA_PACKAGE_ID}::${ARENA_MODULE}::${functionName}`
}

export interface LaunchCallParams {
  bondAmount: bigint
  isUp: boolean
  oracleId: string
  strikePriceUsd: number
  walletAddress: string
}

export interface BackCallParams {
  callId: string
  managerId: string
  oracleId: string
  paymentAmount: bigint
  quantity: bigint
  walletAddress: string
}

export type FadeCallParams = BackCallParams

export interface ClaimBondParams {
  callId: string
  oracleId: string
  walletAddress: string
}

export interface ReclaimBondParams {
  callId: string
  walletAddress: string
}

export function buildLaunchCallTransaction({
  bondAmount,
  isUp,
  oracleId,
  strikePriceUsd,
  walletAddress,
}: LaunchCallParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const bondCoin = buildQuoteCoin(tx, bondAmount)

  tx.moveCall({
    target: target("launch_call"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(ARENA_OBJECT_ID),
      tx.object(PREDICT_OBJECT_ID),
      tx.object(oracleId),
      bondCoin,
      tx.pure.u64(toOnchainPrice(strikePriceUsd)),
      tx.pure.bool(isUp),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  return tx
}

function buildBackOrFadeTransaction(
  functionName: "back_call" | "fade_call",
  { callId, managerId, oracleId, paymentAmount, quantity, walletAddress }: BackCallParams
) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const paymentCoin = buildQuoteCoin(tx, paymentAmount)

  const refund = tx.moveCall({
    target: target(functionName),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(managerId),
      tx.object(oracleId),
      tx.object(callId),
      paymentCoin,
      tx.pure.u64(quantity),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([refund], walletAddress)

  return tx
}

export function buildBackCallTransaction(params: BackCallParams) {
  return buildBackOrFadeTransaction("back_call", params)
}

export function buildFadeCallTransaction(params: FadeCallParams) {
  return buildBackOrFadeTransaction("fade_call", params)
}

export function buildClaimBondTransaction({
  callId,
  oracleId,
  walletAddress,
}: ClaimBondParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)

  const plpCoin = tx.moveCall({
    target: target("claim_bond"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(callId),
      tx.object(oracleId),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([plpCoin], walletAddress)

  return tx
}

export function buildReclaimBondTransaction({
  callId,
  walletAddress,
}: ReclaimBondParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)

  const plpCoin = tx.moveCall({
    target: target("reclaim_bond"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [tx.object(callId), tx.object(PREDICT_CLOCK_ID)],
  })

  tx.transferObjects([plpCoin], walletAddress)

  return tx
}

export function executeLaunchCall(
  params: LaunchCallParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(signer, buildLaunchCallTransaction(params))
}

export function executeBackCall(
  params: BackCallParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(signer, buildBackCallTransaction(params))
}

export function executeFadeCall(
  params: FadeCallParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(signer, buildFadeCallTransaction(params))
}

export function executeClaimBond(
  params: ClaimBondParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(signer, buildClaimBondTransaction(params))
}

export function executeReclaimBond(
  params: ReclaimBondParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(signer, buildReclaimBondTransaction(params))
}
