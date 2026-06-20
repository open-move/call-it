import { bcs } from "@mysten/sui/bcs"
import type { SuiClientTypes } from "@mysten/sui/client"
import { coinWithBalance, Transaction } from "@mysten/sui/transactions"
import { fromBase64 } from "@mysten/sui/utils"

import {
  PREDICT_CLOCK_ID,
  PREDICT_LP_ASSET,
  PREDICT_OBJECT_ID,
  PREDICT_PACKAGE_ID,
  PREDICT_PRICE_SCALE,
  PREDICT_QUOTE_ASSET,
} from "@/lib/config"
import { isDeterministicPredictPreflightFailure } from "./predict-errors"
import { getSuiGrpcClient } from "./sui-client"
import { parseSuiFailure } from "./sui-errors"

export interface SuiTransactionSigner {
  signTransaction: (transaction: Transaction) => Promise<{
    bytes: string
    signature: string
  }>
}

export interface DirectionalTradeParams {
  expiryMs: number
  isUp: boolean
  kind?: "binary"
  oracleId: string
  quantity: bigint
  strikePriceUsd: number
  walletAddress: string
}

export interface RangeTradeParams {
  expiryMs: number
  higherStrikePriceUsd: number
  kind: "range"
  lowerStrikePriceUsd: number
  oracleId: string
  quantity: bigint
  walletAddress: string
}

export type PredictTradeParams = DirectionalTradeParams | RangeTradeParams

export interface DirectionalRedeemParams {
  expiryMs: number
  isUp: boolean
  kind?: "binary"
  oracleId: string
  quantity: bigint
  strikePriceUsd: number
  walletAddress: string
}

export interface RangeRedeemParams {
  expiryMs: number
  higherStrikePriceUsd: number
  kind: "range"
  lowerStrikePriceUsd: number
  oracleId: string
  quantity: bigint
  walletAddress: string
}

export type PredictRedeemParams = DirectionalRedeemParams | RangeRedeemParams

export interface PredictTradeQuote {
  mintCost: bigint
  redeemPayout: bigint
}

export interface LiquidityTransactionParams {
  amount: bigint
  walletAddress: string
}

export interface PreparedPredictMintTransaction {
  actualCost: bigint
  depositAmount: bigint
  reserveAmount: bigint
  transaction: Transaction
}

export interface ExecutedSuiTransaction {
  digest: string
  events: SuiClientTypes.Event[]
}

function target(module: string, functionName: string) {
  return `${PREDICT_PACKAGE_ID}::${module}::${functionName}`
}

export function toOnchainPrice(valueUsd: number) {
  return BigInt(Math.round(valueUsd * PREDICT_PRICE_SCALE))
}

function buildMarketKey(tx: Transaction, params: DirectionalTradeParams) {
  return tx.moveCall({
    target: target("market_key", "new"),
    arguments: [
      tx.pure.id(params.oracleId),
      tx.pure.u64(BigInt(params.expiryMs)),
      tx.pure.u64(toOnchainPrice(params.strikePriceUsd)),
      tx.pure.bool(params.isUp),
    ],
  })
}

function buildRangeKey(tx: Transaction, params: RangeTradeParams) {
  return tx.moveCall({
    target: target("range_key", "new"),
    arguments: [
      tx.pure.id(params.oracleId),
      tx.pure.u64(BigInt(params.expiryMs)),
      tx.pure.u64(toOnchainPrice(params.lowerStrikePriceUsd)),
      tx.pure.u64(toOnchainPrice(params.higherStrikePriceUsd)),
    ],
  })
}

function buildRedeemRangeKey(tx: Transaction, params: RangeRedeemParams) {
  return tx.moveCall({
    target: target("range_key", "new"),
    arguments: [
      tx.pure.id(params.oracleId),
      tx.pure.u64(BigInt(params.expiryMs)),
      tx.pure.u64(toOnchainPrice(params.lowerStrikePriceUsd)),
      tx.pure.u64(toOnchainPrice(params.higherStrikePriceUsd)),
    ],
  })
}

function buildRedeemMarketKey(
  tx: Transaction,
  params: DirectionalRedeemParams
) {
  return tx.moveCall({
    target: target("market_key", "new"),
    arguments: [
      tx.pure.id(params.oracleId),
      tx.pure.u64(BigInt(params.expiryMs)),
      tx.pure.u64(toOnchainPrice(params.strikePriceUsd)),
      tx.pure.bool(params.isUp),
    ],
  })
}

function isRangeTradeParams(
  params: PredictTradeParams
): params is RangeTradeParams {
  return params.kind === "range"
}

function isRangeRedeemParams(
  params: PredictRedeemParams
): params is RangeRedeemParams {
  return params.kind === "range"
}

function readU64Output(output: SuiClientTypes.CommandOutput) {
  return BigInt(bcs.U64.parse(output.bcs))
}

function getEventString(event: SuiClientTypes.Event, key: string) {
  const value = event.json?.[key]

  return typeof value === "string" ? value : undefined
}

function getEventBigInt(event: SuiClientTypes.Event, key: string) {
  const value = event.json?.[key]

  if (typeof value === "number") {
    return BigInt(value)
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value)
  }

  return undefined
}

function addBasisPoints(value: bigint, basisPoints: bigint) {
  return (value * (10_000n + basisPoints) + 9_999n) / 10_000n
}

function findMintCost(events: SuiClientTypes.Event[]) {
  for (const event of events) {
    if (
      event.eventType.endsWith("::predict::PositionMinted") ||
      event.eventType.endsWith("::predict::RangeMinted")
    ) {
      return getEventBigInt(event, "cost")
    }
  }

  for (const event of events) {
    const cost = getEventBigInt(event, "cost")

    if (cost !== undefined) {
      return cost
    }
  }

  return undefined
}

function buildCoin(tx: Transaction, amount: bigint, coinType: string) {
  return tx.add(coinWithBalance({ balance: amount, type: coinType }))
}

export function buildQuoteCoin(
  tx: Transaction,
  amountOrOwner: bigint | string,
  maybeAmount?: bigint
) {
  const amount = typeof amountOrOwner === "bigint" ? amountOrOwner : maybeAmount

  if (amount === undefined) {
    throw new Error("Missing DUSDC amount")
  }

  return buildCoin(tx, amount, PREDICT_QUOTE_ASSET)
}

function buildLpCoin(tx: Transaction, amount: bigint) {
  return buildCoin(tx, amount, PREDICT_LP_ASSET)
}

export function buildCreateManagerTransaction(walletAddress: string) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  tx.moveCall({ target: target("predict", "create_manager") })

  return tx
}

export function buildManagerDepositTransaction({
  amount,
  managerId,
  walletAddress,
}: {
  amount: bigint
  managerId: string
  walletAddress: string
}) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const paymentCoin = buildQuoteCoin(tx, amount)

  tx.moveCall({
    target: target("predict_manager", "deposit"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [tx.object(managerId), paymentCoin],
  })

  return tx
}

export function buildManagerWithdrawTransaction({
  amount,
  managerId,
  walletAddress,
}: {
  amount: bigint
  managerId: string
  walletAddress: string
}) {
  const tx = new Transaction()
  tx.setSender(walletAddress)

  const quoteCoin = tx.moveCall({
    target: target("predict_manager", "withdraw"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [tx.object(managerId), tx.pure.u64(amount)],
  })

  tx.transferObjects([quoteCoin], walletAddress)

  return tx
}

export function buildPredictQuoteTransaction(params: PredictTradeParams) {
  const tx = new Transaction()
  tx.setSender(params.walletAddress)

  if (isRangeTradeParams(params)) {
    const key = buildRangeKey(tx, params)

    tx.moveCall({
      target: target("predict", "get_range_trade_amounts"),
      arguments: [
        tx.object(PREDICT_OBJECT_ID),
        tx.object(params.oracleId),
        key,
        tx.pure.u64(params.quantity),
        tx.object(PREDICT_CLOCK_ID),
      ],
    })

    return tx
  }

  const key = buildMarketKey(tx, params)

  tx.moveCall({
    target: target("predict", "get_trade_amounts"),
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(params.oracleId),
      key,
      tx.pure.u64(params.quantity),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  return tx
}

export function buildPredictMintTransaction({
  depositAmount,
  managerId,
  params,
}: {
  depositAmount: bigint
  managerId: string
  params: PredictTradeParams
}) {
  const tx = new Transaction()
  tx.setSender(params.walletAddress)

  if (depositAmount > 0n) {
    const paymentCoin = buildQuoteCoin(tx, depositAmount)

    tx.moveCall({
      target: target("predict_manager", "deposit"),
      typeArguments: [PREDICT_QUOTE_ASSET],
      arguments: [tx.object(managerId), paymentCoin],
    })
  }

  if (isRangeTradeParams(params)) {
    const key = buildRangeKey(tx, params)

    tx.moveCall({
      target: target("predict", "mint_range"),
      typeArguments: [PREDICT_QUOTE_ASSET],
      arguments: [
        tx.object(PREDICT_OBJECT_ID),
        tx.object(managerId),
        tx.object(params.oracleId),
        key,
        tx.pure.u64(params.quantity),
        tx.object(PREDICT_CLOCK_ID),
      ],
    })

    return tx
  }

  const key = buildMarketKey(tx, params)
  tx.moveCall({
    target: target("predict", "mint"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(managerId),
      tx.object(params.oracleId),
      key,
      tx.pure.u64(params.quantity),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  return tx
}

export function buildPredictRedeemTransaction({
  managerId,
  params,
}: {
  managerId: string
  params: PredictRedeemParams
}) {
  const tx = new Transaction()
  tx.setSender(params.walletAddress)

  if (isRangeRedeemParams(params)) {
    const key = buildRedeemRangeKey(tx, params)

    tx.moveCall({
      target: target("predict", "redeem_range"),
      typeArguments: [PREDICT_QUOTE_ASSET],
      arguments: [
        tx.object(PREDICT_OBJECT_ID),
        tx.object(managerId),
        tx.object(params.oracleId),
        key,
        tx.pure.u64(params.quantity),
        tx.object(PREDICT_CLOCK_ID),
      ],
    })

    return tx
  }

  const key = buildRedeemMarketKey(tx, params)
  tx.moveCall({
    target: target("predict", "redeem"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(managerId),
      tx.object(params.oracleId),
      key,
      tx.pure.u64(params.quantity),
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  return tx
}

export function buildSupplyLiquidityTransaction({
  amount,
  walletAddress,
}: LiquidityTransactionParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const paymentCoin = buildQuoteCoin(tx, amount)

  const lpCoin = tx.moveCall({
    target: target("predict", "supply"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      paymentCoin,
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([lpCoin], walletAddress)

  return tx
}

export function buildWithdrawLiquidityTransaction({
  amount,
  walletAddress,
}: LiquidityTransactionParams) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  const lpCoin = buildLpCoin(tx, amount)

  const quoteCoin = tx.moveCall({
    target: target("predict", "withdraw"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      lpCoin,
      tx.object(PREDICT_CLOCK_ID),
    ],
  })

  tx.transferObjects([quoteCoin], walletAddress)

  return tx
}

export async function quotePredictTrade(params: PredictTradeParams) {
  const result = await getSuiGrpcClient().simulateTransaction({
    checksEnabled: false,
    include: { commandResults: true },
    transaction: buildPredictQuoteTransaction(params),
  })

  if (result.$kind === "FailedTransaction") {
    throw new Error(
      result.FailedTransaction.status.error?.message ??
        "Quote simulation failed"
    )
  }

  const quoteResult = result.commandResults.at(-1)
  const [mintCost, redeemPayout] = quoteResult?.returnValues ?? []

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!mintCost || !redeemPayout) {
    throw new Error("Quote simulation did not return trade amounts")
  }

  return {
    mintCost: readU64Output(mintCost),
    redeemPayout: readU64Output(redeemPayout),
  } satisfies PredictTradeQuote
}

export async function preparePredictMintTransaction({
  managerBalance,
  managerId,
  params,
  quotedCost,
}: {
  managerBalance: bigint
  managerId: string
  params: PredictTradeParams
  quotedCost: bigint
}): Promise<PreparedPredictMintTransaction> {
  let reserveAmount = addBasisPoints(quotedCost, 1_000n)
  let effectiveManagerBalance = managerBalance
  let lastError: string | undefined

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const depositAmount =
      reserveAmount > effectiveManagerBalance
        ? reserveAmount - effectiveManagerBalance
        : 0n
    const transaction = buildPredictMintTransaction({
      depositAmount,
      managerId,
      params,
    })
    const result = await getSuiGrpcClient().simulateTransaction({
      checksEnabled: false,
      include: { events: true },
      transaction,
    })

    if (result.$kind === "Transaction") {
      const actualCost = findMintCost(result.Transaction.events)

      if (!actualCost) {
        throw new Error("Mint simulation did not return a position cost")
      }

      const bufferedCost = addBasisPoints(actualCost, 100n)

      if (bufferedCost <= reserveAmount) {
        return { actualCost, depositAmount, reserveAmount, transaction }
      }

      reserveAmount = bufferedCost
    } else {
      lastError = result.FailedTransaction.status.error?.message

      if (effectiveManagerBalance > 0n && depositAmount < reserveAmount) {
        effectiveManagerBalance = 0n
        continue
      }

      if (
        lastError &&
        isDeterministicPredictPreflightFailure(parseSuiFailure(lastError))
      ) {
        throw new Error(lastError)
      }

      reserveAmount *= 2n
    }
  }

  throw new Error(lastError ?? "Could not prepare mint transaction")
}

export async function simulatePredictRedeemTransaction({
  managerId,
  params,
}: {
  managerId: string
  params: PredictRedeemParams
}) {
  const result = await getSuiGrpcClient().simulateTransaction({
    checksEnabled: false,
    include: { events: true },
    transaction: buildPredictRedeemTransaction({ managerId, params }),
  })

  if (result.$kind === "FailedTransaction") {
    throw new Error(
      result.FailedTransaction.status.error?.message ??
        "Redeem simulation failed"
    )
  }

  return result.Transaction.events
}

export async function executeSuiTransaction(
  signer: SuiTransactionSigner,
  transaction: Transaction
): Promise<ExecutedSuiTransaction> {
  const client = getSuiGrpcClient()
  const transactionBytes = await transaction.build({ client })
  const signed = await signer.signTransaction(
    Transaction.from(transactionBytes)
  )
  const result = await client.executeTransaction({
    include: { effects: true, events: true },
    signatures: [signed.signature],
    transaction: fromBase64(signed.bytes),
  })

  if (result.$kind === "FailedTransaction") {
    throw new Error(
      result.FailedTransaction.status.error?.message ?? "Transaction failed"
    )
  }

  const finalResult = await client.waitForTransaction({
    include: { effects: true, events: true },
    result,
    timeout: 60_000,
  })

  if (finalResult.$kind === "FailedTransaction") {
    throw new Error(
      finalResult.FailedTransaction.status.error?.message ??
        "Transaction failed"
    )
  }

  return {
    digest: finalResult.Transaction.digest,
    events: finalResult.Transaction.events,
  }
}

export function findCreatedManagerId(events: SuiClientTypes.Event[]) {
  for (const event of events) {
    if (event.eventType.endsWith("::predict_manager::PredictManagerCreated")) {
      const managerId = getEventString(event, "manager_id")

      if (managerId) {
        return managerId
      }
    }
  }

  return undefined
}
