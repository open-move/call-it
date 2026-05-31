import { bcs } from "@mysten/sui/bcs"
import { type SuiClientTypes } from "@mysten/sui/client"

import { type DirectionalTradeQuote } from "./predict-transactions"
import {
  buildDirectionalQuoteTransaction,
  type DirectionalTradeParams,
} from "./predict-transactions"
import {
  getSuiFailureMessage,
  parseSuiFailure,
  type SuiFailure,
} from "./sui-errors"
import { simulateSuiTransaction } from "./sui-simulate"

export type PredictQuoteResult =
  | ({ status: "quoted" } & DirectionalTradeQuote)
  | {
      reason: "saturated_fair_price"
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

function mapQuoteFailure(failure: SuiFailure): PredictQuoteResult {
  if (isSaturatedFairPriceMoveAbort(failure)) {
    return { reason: "saturated_fair_price", status: "no_quote" }
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

  if (isSaturatedFairPriceMoveAbort(failure)) {
    return "No quote for this strike. Choose a strike closer to spot."
  }

  return message
}

export function formatPredictQuoteMessage(result: PredictQuoteResult) {
  if (isSaturatedFairPriceFailure(result)) {
    return "No quote for this strike. Choose a strike closer to spot."
  }

  if (result.status === "unavailable") {
    return result.message
  }

  return undefined
}

export async function quoteDirectionalTradeSafe(
  params: DirectionalTradeParams
): Promise<PredictQuoteResult> {
  const result = await simulateSuiTransaction({
    checksEnabled: false,
    include: { commandResults: true },
    transaction: buildDirectionalQuoteTransaction(params),
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

  return {
    mintCost: readU64Output(mintCost),
    redeemPayout: readU64Output(redeemPayout),
    status: "quoted",
  }
}
