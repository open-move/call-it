import { Transaction } from "@mysten/sui/transactions"

import {
  PREDICT_CLOCK_ID,
  PREDICT_OBJECT_ID,
  PREDICT_QUOTE_ASSET,
  PROTECT_PACKAGE_ID,
} from "@/lib/config"
import {
  formatPredictQuoteMessage,
  quotePredictTradeSafe,
} from "./predict-quotes"
import { buildQuoteCoin, toOnchainPrice } from "./predict-transactions"
import { getSuiGrpcClient } from "./sui-client"

export interface ProtectOpenParams {
  expiryMs: number
  isUp?: boolean
  managerId: string
  oracleId: string
  quantity: bigint
  triggerStrikeUsd: number
  walletAddress: string
}

export interface PreparedProtectOpenTransaction {
  estimatedCost: bigint
  maxPremiumAmount: bigint
  transaction: Transaction
}

export interface ProtectClaimParams {
  managerId: string
  oracleId: string
  policyId: string
  walletAddress: string
}

const PREMIUM_BUFFER_BPS = 200n

function protectTarget(functionName: string) {
  return `${PROTECT_PACKAGE_ID}::protect::${functionName}`
}

function addBasisPoints(value: bigint, basisPoints: bigint) {
  return (value * (10_000n + basisPoints) + 9_999n) / 10_000n
}

function formatProtectError(message: string) {
  if (message.includes("EInvalidPremium")) {
    return "Premium must be greater than zero."
  }

  if (message.includes("EInvalidHedgeStrike")) {
    return "Protect trigger must be below spot for DOWN protection."
  }

  if (message.includes("EExceededPremium")) {
    return "Protect premium is too low for this hedge size."
  }

  if (message.includes("EProtectionPositionChanged")) {
    return "This account already has a matching position for this Protect trigger."
  }

  if (message.includes("ENotManagerOwner")) {
    return "Only the trading account owner can claim this Protect policy."
  }

  return message
}

async function assertProtectTransactionReady(
  transaction: Transaction,
  fallbackMessage: string
) {
  const result = await getSuiGrpcClient().simulateTransaction({
    checksEnabled: false,
    include: { events: true },
    transaction,
  })

  if (result.$kind === "FailedTransaction") {
    throw new Error(
      formatProtectError(
        result.FailedTransaction.status.error?.message ?? fallbackMessage
      )
    )
  }
}

async function buildProtectOpenTransaction({
  isUp = false,
  managerId,
  maxPremiumAmount,
  oracleId,
  quantity,
  triggerStrikeUsd,
  walletAddress,
}: ProtectOpenParams & { maxPremiumAmount: bigint }) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const paymentCoin = await buildQuoteCoin(tx, walletAddress, maxPremiumAmount)
  const [policy, refundCoin] = tx.moveCall({
    target: protectTarget("open"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(managerId),
      tx.object(oracleId),
      paymentCoin,
      tx.pure.u64(toOnchainPrice(triggerStrikeUsd)),
      tx.pure.bool(isUp),
      tx.pure.u64(quantity),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([policy, refundCoin], walletAddress)

  return tx
}

export async function prepareProtectOpenTransaction(
  params: ProtectOpenParams
): Promise<PreparedProtectOpenTransaction> {
  if (params.quantity <= 0n) {
    throw new Error("Enter a positive Protect quantity")
  }

  const quote = await quotePredictTradeSafe({
    expiryMs: params.expiryMs,
    isUp: params.isUp ?? false,
    oracleId: params.oracleId,
    quantity: params.quantity,
    strikePriceUsd: params.triggerStrikeUsd,
    walletAddress: params.walletAddress,
  })

  if (quote.status !== "quoted") {
    throw new Error(
      formatPredictQuoteMessage(quote) ?? "No executable Protect quote"
    )
  }

  const maxPremiumAmount = addBasisPoints(quote.mintCost, PREMIUM_BUFFER_BPS)
  const transaction = await buildProtectOpenTransaction({
    ...params,
    maxPremiumAmount,
  })

  await assertProtectTransactionReady(transaction, "Could not prepare Protect")

  return {
    estimatedCost: quote.mintCost,
    maxPremiumAmount,
    transaction,
  }
}

function buildProtectClaimTransaction({
  managerId,
  oracleId,
  policyId,
  walletAddress,
}: ProtectClaimParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const payoutCoin = tx.moveCall({
    target: protectTarget("claim"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(managerId),
      tx.object(oracleId),
      tx.object(policyId),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([payoutCoin], walletAddress)

  return tx
}

export async function prepareProtectClaimTransaction(
  params: ProtectClaimParams
) {
  const transaction = buildProtectClaimTransaction(params)

  await assertProtectTransactionReady(
    transaction,
    "Could not prepare Protect claim"
  )

  return transaction
}
