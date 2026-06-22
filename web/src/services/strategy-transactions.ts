import { coinWithBalance, Transaction } from "@mysten/sui/transactions"

import { BASE_VAULT_ID, PREDICT_QUOTE_ASSET } from "@/lib/config"
import { DEPLOYMENT } from "@/lib/deployment"
import {
  buildQuoteCoin,
  executeSuiTransaction,
  type ExecutedSuiTransaction,
  type SuiTransactionSigner,
} from "./predict-transactions"

const STRATEGY_MODULE = "strategy"

export type StrategyKey =
  | "bullish-upside"
  | "hedged-plp"
  | "plp-collar"
  | "range-ladder"
  | "strangle"

interface ShareTypeDescriptor {
  module: string
  type: string
}

const SHARE_TYPE_DESCRIPTORS: Record<StrategyKey, ShareTypeDescriptor> = {
  "bullish-upside": { module: "bup", type: "BUP" },
  "hedged-plp": { module: "hplp", type: "HPLP" },
  "plp-collar": { module: "pcollar", type: "PCOLLAR" },
  "range-ladder": { module: "rladder", type: "RLADDER" },
  strangle: { module: "strangle", type: "STRANGLE" },
}

function getStrategyDeployment(key: StrategyKey) {
  return DEPLOYMENT.strategies[key]
}

function target(key: StrategyKey, functionName: string) {
  return `${getStrategyDeployment(key).packageId}::${STRATEGY_MODULE}::${functionName}`
}

export function getShareCoinType(key: StrategyKey) {
  const { packageId } = getStrategyDeployment(key)
  const { module, type } = SHARE_TYPE_DESCRIPTORS[key]

  return `${packageId}::${module}::${type}`
}

function getBaseVaultId() {
  return DEPLOYMENT.baseVault.vaultId || BASE_VAULT_ID
}

function buildCoinOfType(tx: Transaction, amount: bigint, coinType: string) {
  return tx.add(coinWithBalance({ balance: amount, type: coinType }))
}

function buildShareCoin(tx: Transaction, key: StrategyKey, amount: bigint) {
  return buildCoinOfType(tx, amount, getShareCoinType(key))
}

export interface StrategyDepositParams {
  amount: bigint
  strategyKey: StrategyKey
  walletAddress: string
}

export interface StrategyWithdrawParams {
  shareAmount: bigint
  strategyKey: StrategyKey
  walletAddress: string
}

export interface StrategyRequestWithdrawParams {
  shareAmount: bigint
  strategyKey: StrategyKey
  walletAddress: string
}

export interface StrategyCancelRequestParams {
  strategyKey: StrategyKey
  walletAddress: string
}

export interface StrategyClaimWithdrawalParams {
  strategyKey: StrategyKey
  walletAddress: string
}

export function buildStrategyDepositTransaction({
  amount,
  strategyKey,
  walletAddress,
}: StrategyDepositParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const funds = buildQuoteCoin(tx, amount)

  const shares = tx.moveCall({
    target: target(strategyKey, "deposit"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(getStrategyDeployment(strategyKey).strategyId),
      tx.object(getBaseVaultId()),
      funds,
    ],
  })

  tx.transferObjects([shares], walletAddress)

  return tx
}

export interface StrategyQueueDepositParams {
  amount: bigint
  strategyKey: StrategyKey
  walletAddress: string
}

export interface StrategyCancelPendingParams {
  strategyKey: StrategyKey
  walletAddress: string
}

export interface StrategyClaimSharesParams {
  strategyKey: StrategyKey
  walletAddress: string
}

/**
 * Park a deposit while a round is live. Mints no shares now — the quote is held
 * aside and folded into shares at the next settlement, then pulled via
 * `claim_shares`. Refundable 1:1 via `cancel_pending` until then.
 */
export function buildStrategyQueueDepositTransaction({
  amount,
  strategyKey,
  walletAddress,
}: StrategyQueueDepositParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const funds = buildQuoteCoin(tx, amount)

  tx.moveCall({
    target: target(strategyKey, "queue_deposit"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(getStrategyDeployment(strategyKey).strategyId),
      funds,
    ],
  })

  return tx
}

/** Refund a parked (not-yet-settled) deposit 1:1. */
export function buildStrategyCancelPendingTransaction({
  strategyKey,
  walletAddress,
}: StrategyCancelPendingParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)

  const quoteCoin = tx.moveCall({
    target: target(strategyKey, "cancel_pending"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [tx.object(getStrategyDeployment(strategyKey).strategyId)],
  })

  tx.transferObjects([quoteCoin], walletAddress)

  return tx
}

/**
 * Pull a settled deposit's shares (or its 1:1 refund for a dust round) into the
 * owner's wallet. Permissionless — the contract delivers to `walletAddress`.
 */
export function buildStrategyClaimSharesTransaction({
  strategyKey,
  walletAddress,
}: StrategyClaimSharesParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)

  tx.moveCall({
    target: target(strategyKey, "claim_shares"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(getStrategyDeployment(strategyKey).strategyId),
      tx.pure.address(walletAddress),
    ],
  })

  return tx
}

export function buildStrategyWithdrawTransaction({
  shareAmount,
  strategyKey,
  walletAddress,
}: StrategyWithdrawParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const shares = buildShareCoin(tx, strategyKey, shareAmount)

  const quoteCoin = tx.moveCall({
    target: target(strategyKey, "withdraw"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(getStrategyDeployment(strategyKey).strategyId),
      tx.object(getBaseVaultId()),
      shares,
    ],
  })

  tx.transferObjects([quoteCoin], walletAddress)

  return tx
}

export function buildStrategyRequestWithdrawTransaction({
  shareAmount,
  strategyKey,
  walletAddress,
}: StrategyRequestWithdrawParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const shares = buildShareCoin(tx, strategyKey, shareAmount)

  tx.moveCall({
    target: target(strategyKey, "request_withdraw"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(getStrategyDeployment(strategyKey).strategyId),
      shares,
    ],
  })

  return tx
}

export function buildStrategyCancelRequestTransaction({
  strategyKey,
  walletAddress,
}: StrategyCancelRequestParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)

  const shares = tx.moveCall({
    target: target(strategyKey, "cancel_request"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [tx.object(getStrategyDeployment(strategyKey).strategyId)],
  })

  tx.transferObjects([shares], walletAddress)

  return tx
}

export function buildStrategyClaimWithdrawalTransaction({
  strategyKey,
  walletAddress,
}: StrategyClaimWithdrawalParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)

  const quoteCoin = tx.moveCall({
    target: target(strategyKey, "claim_withdrawal"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(getStrategyDeployment(strategyKey).strategyId),
      tx.object(getBaseVaultId()),
    ],
  })

  tx.transferObjects([quoteCoin], walletAddress)

  return tx
}

export function executeStrategyDeposit(
  params: StrategyDepositParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(signer, buildStrategyDepositTransaction(params))
}

export function executeStrategyWithdraw(
  params: StrategyWithdrawParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(signer, buildStrategyWithdrawTransaction(params))
}

export function executeStrategyQueueDeposit(
  params: StrategyQueueDepositParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(
    signer,
    buildStrategyQueueDepositTransaction(params)
  )
}

export function executeStrategyCancelPending(
  params: StrategyCancelPendingParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(
    signer,
    buildStrategyCancelPendingTransaction(params)
  )
}

export function executeStrategyClaimShares(
  params: StrategyClaimSharesParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(
    signer,
    buildStrategyClaimSharesTransaction(params)
  )
}

export function executeStrategyRequestWithdraw(
  params: StrategyRequestWithdrawParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(
    signer,
    buildStrategyRequestWithdrawTransaction(params)
  )
}

export function executeStrategyCancelRequest(
  params: StrategyCancelRequestParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(
    signer,
    buildStrategyCancelRequestTransaction(params)
  )
}

export function executeStrategyClaimWithdrawal(
  params: StrategyClaimWithdrawalParams,
  signer: SuiTransactionSigner
): Promise<ExecutedSuiTransaction> {
  return executeSuiTransaction(
    signer,
    buildStrategyClaimWithdrawalTransaction(params)
  )
}
