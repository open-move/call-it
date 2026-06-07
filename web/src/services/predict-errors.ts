import type {SuiFailure} from "./sui-errors";

const ORACLE_CONFIG_MODULE = "oracle_config"
type MoveAbortFailure = Extract<SuiFailure, { kind: "move_abort" }>

function isOracleConfigAbort(
  failure: SuiFailure,
  functionName?: string
): failure is MoveAbortFailure {
  return (
    failure.kind === "move_abort" &&
    failure.abort.moduleName === ORACLE_CONFIG_MODULE &&
    (!functionName || failure.abort.functionName === functionName)
  )
}

function getOracleLifecycleMessage(failure: SuiFailure) {
  if (!isOracleConfigAbort(failure)) {
    return undefined
  }

  const { code, functionName } = failure.abort

  if (functionName === "assert_quoteable_oracle") {
    if (code === 4) {
      return "This market has expired and is waiting for settlement. Choose a later expiry."
    }

    if (code === 5) {
      return "This market is not active. Choose an active expiry."
    }

    if (code === 6) {
      return "Oracle prices are stale. Wait for the next update, then try again."
    }
  }

  if (functionName === "assert_live_oracle") {
    if (code === 3) {
      return "This market has already settled. Open positions can be redeemed from Positions."
    }

    if (code === 4) {
      return "This market has expired and is waiting for settlement. Choose a later expiry."
    }

    if (code === 5) {
      return "This market is not active. Choose an active expiry."
    }

    if (code === 6) {
      return "Oracle prices are stale. Wait for the next update, then try again."
    }
  }

  return undefined
}

function getOracleKeyMessage(failure: SuiFailure) {
  if (!isOracleConfigAbort(failure, "assert_key_matches")) {
    return undefined
  }

  if (failure.abort.code === 0 || failure.abort.code === 1) {
    return "Market selection is stale. Refresh and choose this market again."
  }

  if (failure.abort.code === 2) {
    return "Strike is outside this market's supported grid. Choose another strike."
  }

  return undefined
}

function getOracleStrikeMessage(failure: SuiFailure) {
  if (!isOracleConfigAbort(failure, "assert_valid_strike")) {
    return undefined
  }

  if (failure.abort.code === 2) {
    return "Strike is outside this market's supported grid. Choose another strike."
  }

  return undefined
}

export function getPredictMoveAbortMessage(failure: SuiFailure) {
  return (
    getOracleLifecycleMessage(failure) ??
    getOracleKeyMessage(failure) ??
    getOracleStrikeMessage(failure)
  )
}

export function isDeterministicPredictPreflightFailure(failure: SuiFailure) {
  return getPredictMoveAbortMessage(failure) !== undefined
}
