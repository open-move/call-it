import { bcs } from "@mysten/sui/bcs"
import { type SuiClientTypes } from "@mysten/sui/client"
import {
  Transaction,
  type TransactionObjectArgument,
} from "@mysten/sui/transactions"
import { fromBase64 } from "@mysten/sui/utils"

import {
  PREDICT_CLOCK_ID,
  PREDICT_OBJECT_ID,
  PREDICT_PACKAGE_ID,
  PREDICT_PRICE_SCALE,
  PREDICT_QUOTE_ASSET,
} from "./config"
import { getSuiGrpcClient } from "./sui-client"

export interface SuiTransactionSigner {
  signTransaction(transaction: Transaction): Promise<{
    bytes: string
    signature: string
  }>
}

export interface DirectionalTradeParams {
  expiryMs: number
  isUp: boolean
  oracleId: string
  quantity: bigint
  strikePriceUsd: number
  walletAddress: string
}

export interface DirectionalTradeQuote {
  mintCost: bigint
  redeemPayout: bigint
}

export interface PreparedDirectionalMintTransaction {
  actualCost: bigint
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

function toOnchainPrice(valueUsd: number) {
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
    if (event.eventType.endsWith("::predict::PositionMinted")) {
      return getEventBigInt(event, "cost")
    }
  }

  return undefined
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

async function buildQuoteCoin(
  tx: Transaction,
  owner: string,
  amount: bigint
): Promise<TransactionObjectArgument> {
  const { objects } = await getSuiGrpcClient().listCoins({
    coinType: PREDICT_QUOTE_ASSET,
    limit: 50,
    owner,
  })
  const { selectedBalance, selectedCoins } = selectCoins(objects, amount)
  const [primaryCoin, ...sourceCoins] = selectedCoins

  if (!primaryCoin || selectedBalance < amount) {
    throw new Error("Insufficient DUSDC balance")
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

  const [depositCoin] = tx.splitCoins(paymentCoin, [tx.pure.u64(amount)])

  return depositCoin
}

export function buildCreateManagerTransaction(walletAddress: string) {
  const tx = new Transaction()
  tx.setSender(walletAddress)
  tx.moveCall({ target: target("predict", "create_manager") })

  return tx
}

export function buildDirectionalQuoteTransaction(
  params: DirectionalTradeParams
) {
  const tx = new Transaction()
  tx.setSender(params.walletAddress)
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

export async function buildDirectionalMintTransaction({
  managerId,
  maxCost,
  params,
}: {
  managerId: string
  maxCost: bigint
  params: DirectionalTradeParams
}) {
  const tx = new Transaction()
  tx.setSender(params.walletAddress)
  const paymentCoin = await buildQuoteCoin(tx, params.walletAddress, maxCost)

  tx.moveCall({
    target: target("predict_manager", "deposit"),
    typeArguments: [PREDICT_QUOTE_ASSET],
    arguments: [tx.object(managerId), paymentCoin],
  })

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

export function buildDirectionalRedeemTransaction({
  managerId,
  params,
}: {
  managerId: string
  params: DirectionalTradeParams
}) {
  const tx = new Transaction()
  tx.setSender(params.walletAddress)
  const key = buildMarketKey(tx, params)

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

export async function quoteDirectionalTrade(params: DirectionalTradeParams) {
  const result = await getSuiGrpcClient().simulateTransaction({
    checksEnabled: false,
    include: { commandResults: true },
    transaction: buildDirectionalQuoteTransaction(params),
  })

  if (result.$kind === "FailedTransaction") {
    throw new Error(
      result.FailedTransaction.status.error?.message ??
        "Quote simulation failed"
    )
  }

  const quoteResult = result.commandResults.at(-1)
  const [mintCost, redeemPayout] = quoteResult?.returnValues ?? []

  if (!mintCost || !redeemPayout) {
    throw new Error("Quote simulation did not return trade amounts")
  }

  return {
    mintCost: readU64Output(mintCost),
    redeemPayout: readU64Output(redeemPayout),
  } satisfies DirectionalTradeQuote
}

export async function prepareDirectionalMintTransaction({
  managerId,
  params,
  quotedCost,
}: {
  managerId: string
  params: DirectionalTradeParams
  quotedCost: bigint
}): Promise<PreparedDirectionalMintTransaction> {
  let reserveAmount = addBasisPoints(quotedCost, 1_000n)
  let lastError: string | undefined

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const transaction = await buildDirectionalMintTransaction({
      managerId,
      maxCost: reserveAmount,
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
        return { actualCost, reserveAmount, transaction }
      }

      reserveAmount = bufferedCost
    } else {
      lastError = result.FailedTransaction.status.error?.message
      reserveAmount *= 2n
    }
  }

  throw new Error(lastError ?? "Could not prepare mint transaction")
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
