import type {SuiClientTypes} from "@mysten/sui/client";

import { parseSuiFailure  } from "./sui-errors"
import type {SuiFailure} from "./sui-errors";
import { getSuiGrpcClient } from "./sui-client"

type SuiGrpcClientInstance = ReturnType<typeof getSuiGrpcClient>
type SimulateTransactionOptions = Parameters<
  SuiGrpcClientInstance["simulateTransaction"]
>[0]

export type SuiSimulationResult =
  | {
      status: "success"
      commandResults: SuiClientTypes.CommandResult[]
      events: SuiClientTypes.Event[]
    }
  | {
      status: "failure"
      failure: SuiFailure
    }

export async function simulateSuiTransaction(
  options: SimulateTransactionOptions
): Promise<SuiSimulationResult> {
  const result = await getSuiGrpcClient().simulateTransaction(options)

  if (result.$kind === "FailedTransaction") {
    const message =
      result.FailedTransaction.status.error?.message ?? "Simulation failed"

    return {
      status: "failure",
      failure: parseSuiFailure(message),
    }
  }

  return {
    status: "success",
    commandResults: [],
    events: [],
  }
}
