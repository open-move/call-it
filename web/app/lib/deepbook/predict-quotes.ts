import { bcs } from "@mysten/sui/bcs"
import { type SuiClientTypes } from "@mysten/sui/client"

import { type PredictTradeQuote } from "./predict-transactions"
import { getPredictMoveAbortMessage } from "./predict-errors"
import {
  buildPredictQuoteTransaction,
  type PredictTradeParams,
} from "./predict-transactions"
import {
  getSuiFailureMessage,
  parseSuiFailure,
  type SuiFailure,
} from "./sui-errors"
import { simulateSuiTransaction } from "./sui-simulate"

const MIN_EXECUTABLE_MINT_COST = 10_000n

export type PredictQuoteResult =
  | ({ status: "quoted" } & PredictTradeQuote)
  | {
      reason:
        | "market_unavailable"
        | "mint_cost_too_low"
        | "saturated_fair_price"
      message?: string
      status: "no_quote"
    }
  | {
      message: string
      status: "unavailable"
    }

function readU64Output(output: SuiClientTypes.CommandOutput) {
  return BigInt(bcs.U64.parse(output.bcs))
}

function isSaturatedFairPriceFailure(result: PredictQuoteResult) {
  return (
    result.status === "no_quote" && result.reason === "saturated_fair_price"
  )
}

function isSaturatedFairPriceMoveAbort(failure: SuiFailure) {
  if (
    failure.kind === "move_abort" &&
    failure.abort.moduleName === "pricing_config" &&
    failure.abort.functionName === "quote_spread_from_fair_price" &&
    failure.abort.code === 1
  ) {
    return true
  }

  return false
}

function isMintableAskMoveAbort(failure: SuiFailure) {
  return (
    failure.kind === "move_abort" &&
    failure.abort.moduleName === "predict" &&
    failure.abort.functionName === "assert_mintable_ask" &&
    failure.abort.code === 7
  )
}

function mapQuoteFailure(failure: SuiFailure): PredictQuoteResult {
  const predictMessage = getPredictMoveAbortMessage(failure)

  if (predictMessage) {
    return {
      message: predictMessage,
      reason: "market_unavailable",
      status: "no_quote",
    }
  }

  if (isSaturatedFairPriceMoveAbort(failure)) {
    return { reason: "saturated_fair_price", status: "no_quote" }
  }

  if (isMintableAskMoveAbort(failure)) {
    return { reason: "mint_cost_too_low", status: "no_quote" }
  }

  return {
    message:
      failure.kind === "move_abort" ? failure.abort.message : failure.message,
    status: "unavailable",
  }
}

export function formatPredictTradeError(error: unknown, fallback: string) {
  const message = getSuiFailureMessage(error, fallback)
  const failure = parseSuiFailure(message)
  const normalizedMessage = message.toLowerCase()

  if (isSaturatedFairPriceMoveAbort(failure)) {
    return "No quote for this strike. Choose a strike closer to spot."
  }

  if (isMintableAskMoveAbort(failure)) {
    return "Quote is too small to mint. Increase size or widen the range."
  }

  const predictMessage = getPredictMoveAbortMessage(failure)

  if (predictMessage) {
    return predictMessage
  }

  if (
    normalizedMessage.includes("wallet standard") ||
    normalizedMessage.includes("wallet-standard") ||
    normalizedMessage.includes("wallet does not support") ||
    normalizedMessage.includes("no account found")
  ) {
    return "Reconnect wallet to approve Sui transactions."
  }

  return message
}

export function formatPredictQuoteMessage(result: PredictQuoteResult) {
  if (isSaturatedFairPriceFailure(result)) {
    return "No quote for this strike. Choose a strike closer to spot."
  }

  if (result.status === "no_quote" && result.reason === "mint_cost_too_low") {
    return "Quote is too small to mint. Increase size or widen the range."
  }

  if (result.status === "no_quote" && result.reason === "market_unavailable") {
    return result.message ?? "This market is not available for trading."
  }

  if (result.status === "unavailable") {
    return result.message
  }

  return undefined
}

export async function quotePredictTradeSafe(
  params: PredictTradeParams
): Promise<PredictQuoteResult> {
  const result = await simulateSuiTransaction({
    checksEnabled: false,
    include: { commandResults: true },
    transaction: buildPredictQuoteTransaction(params),
  })

  if (result.status === "failure") {
    return mapQuoteFailure(result.failure)
  }

  const quoteResult = result.commandResults.at(-1)
  const [mintCost, redeemPayout] = quoteResult?.returnValues ?? []

  if (!mintCost || !redeemPayout) {
    return {
      message: "Quote simulation did not return trade amounts",
      status: "unavailable",
    }
  }

  const mintCostValue = readU64Output(mintCost)

  if (mintCostValue < MIN_EXECUTABLE_MINT_COST) {
    return { reason: "mint_cost_too_low", status: "no_quote" }
  }

  return {
    mintCost: mintCostValue,
    redeemPayout: readU64Output(redeemPayout),
    status: "quoted",
  }
}
