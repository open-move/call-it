import { Transaction } from "@mysten/sui/transactions"
import type { SuiClientTypes } from "@mysten/sui/client"
import type { TransactionObjectArgument } from "@mysten/sui/transactions"

import {
  BASE_VAULT_ID,
  PREDICT_CLOCK_ID,
  PREDICT_OBJECT_ID,
  PREDICT_QUOTE_ASSET,
  RANGE_LADDER_PACKAGE_ID,
  RANGE_LADDER_SHARE_ASSET,
  RANGE_LADDER_STRATEGY_ID,
} from "@/lib/config"
import {
  formatPredictQuoteMessage,
  quotePredictTradeSafe,
} from "./predict-quotes"
import { buildQuoteCoin, toOnchainPrice } from "./predict-transactions"
import { getSuiGrpcClient } from "./sui-client"

export interface RangeLadderOpenRung {
  higherStrikeUsd: number
  lowerStrikeUsd: number
  quantity: bigint
}

export interface RangeLadderOpenParams {
  expiryMs: number
  managerId: string
  oracleId: string
  rungs: RangeLadderOpenRung[]
  walletAddress: string
}

export interface PreparedRangeLadderOpenTransaction {
  estimatedCost: bigint
  maxPremiumAmount: bigint
  transaction: Transaction
}

export interface RangeLadderClaimParams {
  managerId: string
  oracleId: string
  policyId: string
  walletAddress: string
}

export interface RangeLadderStrategyTransactionParams {
  amount: bigint
  walletAddress: string
}

const PREMIUM_BUFFER_BPS = 250n

function rangeLadderTarget(functionName: string) {
  return `${RANGE_LADDER_PACKAGE_ID}::strategy::${functionName}`
}

function rangeLadderPolicyTarget(functionName: string) {
  return `${RANGE_LADDER_PACKAGE_ID}::policy::${functionName}`
}

function rangeRungType() {
  return `${RANGE_LADDER_PACKAGE_ID}::policy::Rung`
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

function assertRangeLadderStrategyConfigured() {
  const strategyId: string = RANGE_LADDER_STRATEGY_ID
  const baseVaultId: string = BASE_VAULT_ID

  if (!strategyId || !baseVaultId) {
    throw new Error("Range Ladder strategy is not initialized yet")
  }
}

function addBasisPoints(value: bigint, basisPoints: bigint) {
  return (value * (10_000n + basisPoints) + 9_999n) / 10_000n
}

function formatRangeLadderError(message: string) {
  if (message.includes("EInvalidPremium")) {
    return "Range Ladder premium must be greater than zero."
  }

  if (message.includes("EExceededPremium")) {
    return "Range Ladder premium is too low for these rungs."
  }

  if (message.includes("EOracleNotSettled")) {
    return "Range Ladder can only be claimed after the Predict market settles."
  }

  if (message.includes("ERangePositionChanged")) {
    return "A matching range position changed outside this policy."
  }

  return message
}

async function assertRangeLadderTransactionReady(
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
      formatRangeLadderError(
        result.FailedTransaction.status.error?.message ?? fallbackMessage
      )
    )
  }
}

async function getEstimatedRangeLadderCost(params: RangeLadderOpenParams) {
  let totalCost = 0n

  for (const rung of params.rungs) {
    const quote = await quotePredictTradeSafe({
      expiryMs: params.expiryMs,
      higherStrikePriceUsd: rung.higherStrikeUsd,
      kind: "range",
      lowerStrikePriceUsd: rung.lowerStrikeUsd,
      oracleId: params.oracleId,
      quantity: rung.quantity,
      walletAddress: params.walletAddress,
    })

    if (quote.status !== "quoted") {
      throw new Error(
        formatPredictQuoteMessage(quote) ?? "No executable Range Ladder quote"
      )
    }

    totalCost += quote.mintCost
  }

  return totalCost
}

async function buildRangeLadderOpenTransaction({
  managerId,
  maxPremiumAmount,
  oracleId,
  rungs,
  walletAddress,
}: RangeLadderOpenParams & { maxPremiumAmount: bigint }) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const paymentCoin = await buildQuoteCoin(tx, walletAddress, maxPremiumAmount)
  const rungValues = rungs.map((rung) =>
    tx.moveCall({
      target: rangeLadderPolicyTarget("new_rung"),
      arguments: [
        tx.pure.u64(toOnchainPrice(rung.lowerStrikeUsd)),
        tx.pure.u64(toOnchainPrice(rung.higherStrikeUsd)),
        tx.pure.u64(rung.quantity),
      ],
    })
  )
  const rungsVector = tx.makeMoveVec({
    type: rangeRungType(),
    elements: rungValues,
  })
  const [policy, refundCoin] = tx.moveCall({
    target: rangeLadderTarget("open"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(managerId),
      tx.object(oracleId),
      paymentCoin,
      rungsVector,
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([policy, refundCoin], walletAddress)

  return tx
}

export async function prepareRangeLadderOpenTransaction(
  params: RangeLadderOpenParams
): Promise<PreparedRangeLadderOpenTransaction> {
  if (params.rungs.length === 0) {
    throw new Error("Range Ladder needs at least one rung")
  }

  if (params.rungs.some((rung) => rung.quantity <= 0n)) {
    throw new Error("Enter a positive Range Ladder quantity")
  }

  const estimatedCost = await getEstimatedRangeLadderCost(params)
  const maxPremiumAmount = addBasisPoints(estimatedCost, PREMIUM_BUFFER_BPS)
  const transaction = await buildRangeLadderOpenTransaction({
    ...params,
    maxPremiumAmount,
  })

  await assertRangeLadderTransactionReady(
    transaction,
    "Could not prepare Range Ladder"
  )

  return {
    estimatedCost,
    maxPremiumAmount,
    transaction,
  }
}

function buildRangeLadderClaimTransaction({
  managerId,
  oracleId,
  policyId,
  walletAddress,
}: RangeLadderClaimParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const payoutCoin = tx.moveCall({
    target: rangeLadderTarget("claim"),
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

export async function prepareRangeLadderClaimTransaction(
  params: RangeLadderClaimParams
) {
  const transaction = buildRangeLadderClaimTransaction(params)

  await assertRangeLadderTransactionReady(
    transaction,
    "Could not prepare Range Ladder claim"
  )

  return transaction
}

export async function buildRangeLadderStrategyDepositTransaction({
  amount,
  walletAddress,
}: RangeLadderStrategyTransactionParams) {
  assertRangeLadderStrategyConfigured()

  const tx = new Transaction()
  tx.setSender(walletAddress)
  const paymentCoin = await buildQuoteCoin(tx, walletAddress, amount)
  const shareCoin = tx.moveCall({
    target: rangeLadderTarget("deposit"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(RANGE_LADDER_STRATEGY_ID),
      tx.object(BASE_VAULT_ID),
      paymentCoin,
    ],
  })

  tx.transferObjects([shareCoin], walletAddress)

  return tx
}

export async function buildRangeLadderStrategyWithdrawTransaction({
  amount,
  walletAddress,
}: RangeLadderStrategyTransactionParams) {
  assertRangeLadderStrategyConfigured()

  const tx = new Transaction()
  tx.setSender(walletAddress)
  const shareCoin = await buildCoin(
    tx,
    walletAddress,
    amount,
    RANGE_LADDER_SHARE_ASSET,
    "Insufficient cRANGE balance"
  )
  const quoteCoin = tx.moveCall({
    target: rangeLadderTarget("withdraw"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(RANGE_LADDER_STRATEGY_ID),
      tx.object(BASE_VAULT_ID),
      shareCoin,
    ],
  })

  tx.transferObjects([quoteCoin], walletAddress)

  return tx
}
