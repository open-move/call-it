import { decodeSuiPrivateKey } from "@mysten/sui/cryptography"
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"
import { SuiGrpcClient } from "@mysten/sui/grpc"
import type { SuiClientTypes } from "@mysten/sui/client"
import type { Transaction } from "@mysten/sui/transactions"

import type { OperatorConfig } from "./config.ts"

export type SuiClient = SuiGrpcClient

export interface ExecutedTransaction {
  digest: string
  events: SuiClientTypes.Event[]
}

export interface SimulationResult {
  events: SuiClientTypes.Event[]
  ok: boolean
  error?: string
}

export function createSuiClient(config: OperatorConfig) {
  return new SuiGrpcClient({
    baseUrl: config.suiRpcUrl,
    network: config.suiNetwork,
  })
}

export function loadKeeperKeypair() {
  const raw = process.env.SUI_KEEPER_KEY

  if (!raw || raw.trim() === "") {
    throw new Error(
      "SUI_KEEPER_KEY is required. Export with `sui keytool export --key-identity <addr>`."
    )
  }

  const { scheme, secretKey } = decodeSuiPrivateKey(raw.trim())

  if (scheme !== "ED25519") {
    throw new Error(`Unsupported key scheme ${scheme}; only ED25519 is supported`)
  }

  return Ed25519Keypair.fromSecretKey(secretKey)
}

export async function simulateTransaction(
  client: SuiClient,
  transaction: Transaction
): Promise<SimulationResult> {
  const result = await client.simulateTransaction({
    checksEnabled: false,
    include: { events: true },
    transaction,
  })

  if (result.$kind === "FailedTransaction") {
    return {
      error: result.FailedTransaction.status.error?.message ?? "Simulation failed",
      events: [],
      ok: false,
    }
  }

  return {
    events: Array.isArray(result.Transaction.events) ? result.Transaction.events : [],
    ok: true,
  }
}

export async function executeTransaction(
  client: SuiClient,
  keypair: Ed25519Keypair,
  transaction: Transaction
): Promise<ExecutedTransaction> {
  const result = await client.signAndExecuteTransaction({
    include: { effects: true, events: true },
    signer: keypair,
    transaction,
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
      finalResult.FailedTransaction.status.error?.message ?? "Transaction failed"
    )
  }

  return {
    digest: finalResult.Transaction.digest,
    events: Array.isArray(finalResult.Transaction.events)
      ? finalResult.Transaction.events
      : [],
  }
}

export function eventJson(event: SuiClientTypes.Event) {
  return event.json ?? undefined
}
