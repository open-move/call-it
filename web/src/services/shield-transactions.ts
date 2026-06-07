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
  toOnchainPrice
  
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

const HEDGE_QUANTITY_BUFFER_BPS = 9_900n
const MAX_PREPARE_ATTEMPTS = 6

function shieldTarget(functionName: string) {
  return `${SHIELD_PACKAGE_ID}::shield::${functionName}`
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

  return message
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
