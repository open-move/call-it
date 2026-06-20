import { Transaction } from "@mysten/sui/transactions"
import type { SuiClientTypes } from "@mysten/sui/client"
import type { TransactionObjectArgument } from "@mysten/sui/transactions"

import {
  BASE_VAULT_ID,
  HEDGED_PLP_PACKAGE_ID,
  HEDGED_PLP_SHARE_ASSET,
  HEDGED_PLP_STRATEGY_ID,
  PREDICT_CLOCK_ID,
  PREDICT_OBJECT_ID,
  PREDICT_QUOTE_ASSET,
  SHIELD_PACKAGE_ID,
} from "@/lib/config"
import { quotePredictTradeSafe } from "./predict-quotes"
import { buildQuoteCoin, toOnchainPrice } from "./predict-transactions"
import type { DirectionalTradeParams } from "./predict-transactions"
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
  policyId: string
  walletAddress: string
}

export interface HedgedPlpStrategyTransactionParams {
  amount: bigint
  walletAddress: string
}

const HEDGE_QUANTITY_BUFFER_BPS = 9_900n
const MAX_PREPARE_ATTEMPTS = 6

function shieldTarget(functionName: string) {
  return `${SHIELD_PACKAGE_ID}::shield::${functionName}`
}

function hedgedPlpStrategyTarget(functionName: string) {
  return `${HEDGED_PLP_PACKAGE_ID}::strategy::${functionName}`
}

function selectCoins(coins: SuiClientTypes.Coin[], amount: bigint) {
  const selectedCoins: SuiClientTypes.Coin[] = []
  let selectedBalance = 0n

  for (const coin of coins) {
    selectedCoins.push(coin)
    selectedBalance += BigInt(coin.balance)

    if (selectedBalance >= amount) {
      return { selectedBalance, selectedCoins }
    }
  }

  return { selectedBalance, selectedCoins }
}

async function buildCoin(
  tx: Transaction,
  owner: string,
  amount: bigint,
  coinType: string,
  insufficientBalanceMessage: string
): Promise<TransactionObjectArgument> {
  const { objects } = await getSuiGrpcClient().listCoins({
    coinType,
    limit: 50,
    owner,
  })
  const { selectedBalance, selectedCoins } = selectCoins(objects, amount)
  const [primaryCoin, ...sourceCoins] = selectedCoins

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!primaryCoin || selectedBalance < amount) {
    throw new Error(insufficientBalanceMessage)
  }

  const paymentCoin = tx.object(primaryCoin.objectId)

  if (sourceCoins.length > 0) {
    tx.mergeCoins(
      paymentCoin,
      sourceCoins.map((coin) => tx.object(coin.objectId))
    )
  }

  if (selectedBalance === amount) {
    return paymentCoin
  }

  const [splitCoin] = tx.splitCoins(paymentCoin, [tx.pure.u64(amount)])

  return splitCoin
}

function assertHedgedPlpStrategyConfigured() {
  const strategyId: string = HEDGED_PLP_STRATEGY_ID
  const baseVaultId: string = BASE_VAULT_ID

  if (!strategyId || !baseVaultId) {
    throw new Error("Hedged PLP strategy is not initialized yet")
  }
}

function formatShieldError(message: string) {
  if (message.includes("EInvalidHedgeStrike")) {
    return "Protection trigger must be below spot."
  }

  if (message.includes("EExceededHedgeBudget")) {
    return "Protection cost exceeds the Tail Hedge PLP budget."
  }

  if (message.includes("EHedgePositionChanged")) {
    return "This account already has a DOWN position for this trigger."
  }

  if (message.includes("EOracleNotSettled")) {
    return "This Tail Hedge PLP policy can only be claimed after the Predict market settles."
  }

  if (message.includes("ENotManagerOwner")) {
    return "Only the trading account owner can claim the full Tail Hedge PLP payout."
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
        : (quote.message ?? "No executable protection quote")
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
  const paymentCoin = await buildQuoteCoin(tx, walletAddress, depositAmount)
  const [policy, refundCoin] = tx.moveCall({
    target: shieldTarget("open"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(managerId),
      tx.object(oracleId),
      paymentCoin,
      tx.pure.u64(hedgeBudgetAmount),
      tx.pure.u16(hedgeBudgetBps),
      tx.pure.u64(toOnchainPrice(protectionStrikeUsd)),
      tx.pure.u64(hedgeQuantity),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([policy, refundCoin], walletAddress)

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
    throw new Error("Deposit is too small to open Tail Hedge PLP protection")
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
      throw new Error(
        formatShieldError(lastError ?? "Could not prepare Tail Hedge PLP")
      )
    }

    hedgeQuantity = (hedgeQuantity * 8n) / 10n

    if (hedgeQuantity <= 0n) {
      break
    }
  }

  throw new Error(
    formatShieldError(lastError ?? "Could not prepare Tail Hedge PLP")
  )
}

function buildShieldClaimTransaction({
  managerId,
  oracleId,
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
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([payoutCoin], walletAddress)

  return tx
}

export async function prepareShieldClaimTransaction(params: ShieldClaimParams) {
  const transaction = buildShieldClaimTransaction(params)

  await assertShieldTransactionReady(
    transaction,
    "Could not prepare Tail Hedge PLP claim"
  )

  return transaction
}

export async function buildHedgedPlpStrategyDepositTransaction({
  amount,
  walletAddress,
}: HedgedPlpStrategyTransactionParams) {
  assertHedgedPlpStrategyConfigured()

  const tx = new Transaction()
  tx.setSender(walletAddress)
  const paymentCoin = await buildQuoteCoin(tx, walletAddress, amount)
  const shareCoin = tx.moveCall({
    target: hedgedPlpStrategyTarget("deposit"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(HEDGED_PLP_STRATEGY_ID),
      tx.object(BASE_VAULT_ID),
      paymentCoin,
    ],
  })

  tx.transferObjects([shareCoin], walletAddress)

  return tx
}

export async function buildHedgedPlpStrategyWithdrawTransaction({
  amount,
  walletAddress,
}: HedgedPlpStrategyTransactionParams) {
  assertHedgedPlpStrategyConfigured()

  const tx = new Transaction()
  tx.setSender(walletAddress)
  const shareCoin = await buildCoin(
    tx,
    walletAddress,
    amount,
    HEDGED_PLP_SHARE_ASSET,
    "Insufficient hPLP balance"
  )
  const quoteCoin = tx.moveCall({
    target: hedgedPlpStrategyTarget("withdraw"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(HEDGED_PLP_STRATEGY_ID),
      tx.object(BASE_VAULT_ID),
      shareCoin,
    ],
  })

  tx.transferObjects([quoteCoin], walletAddress)

  return tx
}
