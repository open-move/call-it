import { Transaction } from "@mysten/sui/transactions"

import {
  PREDICT_CLOCK_ID,
  PREDICT_OBJECT_ID,
  PREDICT_QUOTE_ASSET,
  SHIELD_PACKAGE_ID,
} from "@/lib/config"
import { quotePredictTradeSafe } from "./predict-quotes"
import {
  buildQuoteCoin,
  toOnchainPrice,
} from "./predict-transactions"
import type {DirectionalTradeParams} from "./predict-transactions";
import { getSuiGrpcClient } from "./sui-client"

export interface ShieldOpenParams {
  depositAmount: bigint
  expiryMs: number
  hedgeBudgetBps: number
  managerId: string
  oracleId: string
  protectionStrikeUsd: number
  walletAddress: string
}

export interface PreparedShieldOpenTransaction {
  hedgeBudgetAmount: bigint
  hedgeQuantity: bigint
  transaction: Transaction
}

export interface ShieldClaimParams {
  managerId: string
  oracleId: string
  ownerCapId: string
  policyId: string
  walletAddress: string
}

export interface ShieldSettleParams {
  managerId: string
  oracleId: string
  policyId: string
  walletAddress: string
}

const HEDGE_QUANTITY_BUFFER_BPS = 9_900n
const MAX_PREPARE_ATTEMPTS = 6

function shieldTarget(functionName: string) {
  return `${SHIELD_PACKAGE_ID}::shield::${functionName}`
}

export function buildShieldClaimTransaction({
  managerId,
  oracleId,
  ownerCapId,
  policyId,
  walletAddress,
}: {
  managerId: string
  oracleId: string
  ownerCapId: string
  policyId: string
  walletAddress: string
}) {
  const tx = new Transaction()
  tx.setSender(walletAddress)

  const payoutCoin = tx.moveCall({
    target: shieldTarget("claim"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(managerId),
      tx.object(oracleId),
      tx.object(policyId),
      tx.object(ownerCapId),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([payoutCoin], walletAddress)

  return tx
}

function formatShieldError(message: string) {
  if (message.includes("EInvalidHedgeStrike")) {
    return "Protection trigger must be below spot."
  }

  if (message.includes("EExceededHedgeBudget")) {
    return "Protection cost exceeds the Shield budget."
  }

  if (message.includes("EHedgePositionChanged")) {
    return "This account already has a DOWN position for this trigger."
  }

  if (message.includes("EOracleNotSettled")) {
    return "This Shield can only be claimed after the Predict market settles."
  }

  if (message.includes("ENotManagerOwner")) {
    return "Only the trading account owner can claim the full Shield payout."
  }

  if (message.includes("EWrongOwnerCap")) {
    return "This wallet does not have the owner cap for this Shield."
  }

  if (message.includes("EPolicySettled")) {
    return "This Shield policy has already been settled."
  }

  return message
}

async function assertShieldTransactionReady(
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
      formatShieldError(
        result.FailedTransaction.status.error?.message ?? fallbackMessage
      )
    )
  }
}

function getHedgeBudgetAmount(depositAmount: bigint, hedgeBudgetBps: number) {
  return (depositAmount * BigInt(hedgeBudgetBps)) / 10_000n
}

async function getInitialHedgeQuantity({
  depositAmount,
  expiryMs,
  hedgeBudgetAmount,
  oracleId,
  protectionStrikeUsd,
  walletAddress,
}: ShieldOpenParams & { hedgeBudgetAmount: bigint }) {
  const quoteParams = {
    expiryMs,
    isUp: false,
    oracleId,
    quantity: depositAmount,
    strikePriceUsd: protectionStrikeUsd,
    walletAddress,
  } satisfies DirectionalTradeParams
  const quote = await quotePredictTradeSafe(quoteParams)

  if (quote.status !== "quoted") {
    throw new Error(
      quote.status === "unavailable"
        ? quote.message
        : quote.message ?? "No executable protection quote"
    )
  }

  if (quote.mintCost <= hedgeBudgetAmount) {
    return depositAmount
  }

  return (
    (depositAmount * hedgeBudgetAmount * HEDGE_QUANTITY_BUFFER_BPS) /
    quote.mintCost /
    10_000n
  )
}

async function buildShieldOpenTransaction({
  depositAmount,
  hedgeBudgetAmount,
  hedgeBudgetBps,
  hedgeQuantity,
  managerId,
  oracleId,
  protectionStrikeUsd,
  walletAddress,
}: ShieldOpenParams & {
  hedgeBudgetAmount: bigint
  hedgeQuantity: bigint
}) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const paymentCoin = await buildQuoteCoin(
    tx,
    walletAddress,
    depositAmount
  )
  const [ownerCap, refundCoin] = tx.moveCall({
    target: shieldTarget("open"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(managerId),
      tx.object(oracleId),
      paymentCoin,
      tx.pure.address(walletAddress),
      tx.pure.u64(hedgeBudgetAmount),
      tx.pure.u16(hedgeBudgetBps),
      tx.pure.u64(toOnchainPrice(protectionStrikeUsd)),
      tx.pure.u64(hedgeQuantity),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([ownerCap, refundCoin], walletAddress)

  return tx
}

export async function prepareShieldOpenTransaction(
  params: ShieldOpenParams
): Promise<PreparedShieldOpenTransaction> {
  const hedgeBudgetAmount = getHedgeBudgetAmount(
    params.depositAmount,
    params.hedgeBudgetBps
  )
  let hedgeQuantity = await getInitialHedgeQuantity({
    ...params,
    hedgeBudgetAmount,
  })
  let lastError: string | undefined

  if (hedgeBudgetAmount <= 0n || hedgeQuantity <= 0n) {
    throw new Error("Deposit is too small to open Shield protection")
  }

  for (let attempt = 0; attempt < MAX_PREPARE_ATTEMPTS; attempt += 1) {
    const transaction = await buildShieldOpenTransaction({
      ...params,
      hedgeBudgetAmount,
      hedgeQuantity,
    })
    const result = await getSuiGrpcClient().simulateTransaction({
      checksEnabled: false,
      include: { events: true },
      transaction,
    })

    if (result.$kind === "Transaction") {
      return { hedgeBudgetAmount, hedgeQuantity, transaction }
    }

    lastError = result.FailedTransaction.status.error?.message

    if (!lastError?.includes("EExceededHedgeBudget")) {
      throw new Error(formatShieldError(lastError ?? "Could not prepare Shield"))
    }

    hedgeQuantity = (hedgeQuantity * 8n) / 10n

    if (hedgeQuantity <= 0n) {
      break
    }
  }

  throw new Error(formatShieldError(lastError ?? "Could not prepare Shield"))
}

function buildShieldClaimTransaction({
  managerId,
  oracleId,
  ownerCapId,
  policyId,
  walletAddress,
}: ShieldClaimParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)

  const payoutCoin = tx.moveCall({
    target: shieldTarget("claim"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(managerId),
      tx.object(oracleId),
      tx.object(policyId),
      tx.object(ownerCapId),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([payoutCoin], walletAddress)

  return tx
}

function buildShieldSettleTransaction({
  managerId,
  oracleId,
  policyId,
  walletAddress,
}: ShieldSettleParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)

  tx.moveCall({
    target: shieldTarget("settle"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(managerId),
      tx.object(oracleId),
      tx.object(policyId),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  return tx
}

export async function prepareShieldClaimTransaction(params: ShieldClaimParams) {
  const transaction = buildShieldClaimTransaction(params)

  await assertShieldTransactionReady(
    transaction,
    "Could not prepare Shield claim"
  )

  return transaction
}

export async function prepareShieldSettleTransaction(params: ShieldSettleParams) {
  const transaction = buildShieldSettleTransaction(params)

  await assertShieldTransactionReady(
    transaction,
    "Could not prepare Shield settlement"
  )

  return transaction
}
