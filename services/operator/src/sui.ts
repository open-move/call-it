import { decodeSuiPrivateKey } from "@mysten/sui/cryptography"
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"
import { SuiGrpcClient } from "@mysten/sui/grpc"
import type { SuiClientTypes } from "@mysten/sui/client"
import type { Transaction } from "@mysten/sui/transactions"

import type { OperatorConfig } from "./config.ts"
import { logger, toLogFields } from "./logger.ts"

type SimulateTransaction = SuiGrpcClient["simulateTransaction"]
type SignAndExecuteTransaction = SuiGrpcClient["signAndExecuteTransaction"]
type WaitForTransaction = SuiGrpcClient["waitForTransaction"]

export interface SuiClient {
  getObject: SuiGrpcClient["getObject"]
  signAndExecuteTransaction: SignAndExecuteTransaction
  simulateTransaction: SimulateTransaction
  waitForTransaction: WaitForTransaction
}

interface SuiEndpoint {
  client: SuiGrpcClient
  cooldownUntil: number
  disabledReason: string | null
  url: string
}

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
  return new RotatingSuiClient(config)
}

class RotatingSuiClient implements SuiClient {
  private current = 0
  private readonly endpoints: SuiEndpoint[]

  readonly getObject: SuiGrpcClient["getObject"] = ((input) =>
    this.withEndpointRetry((client) => client.getObject(input), "getObject")) as SuiGrpcClient["getObject"]

  readonly signAndExecuteTransaction: SignAndExecuteTransaction = ((input) =>
    this.withEndpointRetry(
      (client) => client.signAndExecuteTransaction(input),
      "signAndExecuteTransaction"
    )) as SignAndExecuteTransaction

  readonly simulateTransaction: SimulateTransaction = ((input) =>
    this.withEndpointRetry((client) => client.simulateTransaction(input), "simulateTransaction")) as SimulateTransaction

  readonly waitForTransaction: WaitForTransaction = ((input) =>
    this.withEndpointRetry((client) => client.waitForTransaction(input), "waitForTransaction")) as WaitForTransaction

  constructor(config: OperatorConfig) {
    this.endpoints = config.suiRpcUrls.map((url) => ({
      client: new SuiGrpcClient({
        baseUrl: url,
        network: config.suiNetwork,
      }),
      cooldownUntil: 0,
      disabledReason: null,
      url,
    }))
    if (this.endpoints.length === 0) {
      throw new Error("at least one Sui RPC URL is required")
    }
  }

  private async withEndpointRetry<T>(run: (client: SuiGrpcClient) => Promise<T>, operation: string): Promise<T> {
    let lastError: unknown = null
    for (let attempt = 0; attempt < this.endpoints.length; attempt += 1) {
      const endpoint = this.nextEndpoint(lastError)
      try {
        return await run(endpoint.client)
      } catch (error) {
        lastError = error
        this.markEndpointFailure(endpoint, operation, error)
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private nextEndpoint(lastError: unknown): SuiEndpoint {
    const now = Date.now()
    for (let offset = 0; offset < this.endpoints.length; offset += 1) {
      const index = (this.current + offset) % this.endpoints.length
      const endpoint = this.endpoints[index]
      if (endpoint !== undefined && endpoint.disabledReason === null && endpoint.cooldownUntil <= now) {
        this.current = (index + 1) % this.endpoints.length
        return endpoint
      }
    }

    const unavailable = this.endpoints.map((endpoint) => ({
      cooldownUntil: endpoint.cooldownUntil,
      disabledReason: endpoint.disabledReason,
      url: endpoint.url,
    }))
    logger.warn(toLogFields({ endpoints: unavailable }), "all Sui RPC endpoints unavailable")
    throw lastError instanceof Error ? lastError : new Error("all Sui RPC endpoints are unavailable")
  }

  private markEndpointFailure(endpoint: SuiEndpoint, operation: string, error: unknown): void {
    const classification = classifyEndpointFailure(error)
    if (classification.kind === "disable") {
      endpoint.disabledReason = classification.reason
    } else {
      endpoint.cooldownUntil = Math.max(endpoint.cooldownUntil, Date.now() + classification.cooldownMs)
    }

    logger.warn(
      toLogFields({
        cooldownMs: classification.kind === "cooldown" ? classification.cooldownMs : null,
        disabled: classification.kind === "disable",
        error: error instanceof Error ? error.message : String(error),
        operation,
        reason: classification.reason,
        url: endpoint.url,
      }),
      "Sui RPC endpoint failed; rotating"
    )
  }
}

type EndpointFailure =
  | { kind: "cooldown"; cooldownMs: number; reason: string }
  | { kind: "disable"; reason: string }

function classifyEndpointFailure(error: unknown): EndpointFailure {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (
    normalized.includes("invalid grpc request content-type") ||
    normalized.includes("forbidden") ||
    normalized.includes("typo in the url or port") ||
    normalized.includes("unable to connect. is the computer able to access the url")
  ) {
    return { kind: "disable", reason: message }
  }

  if (normalized.includes("too many requests") || normalized.includes("resourceexhausted")) {
    return { kind: "cooldown", cooldownMs: retryAfterMs(normalized) ?? 60_000, reason: message }
  }

  if (normalized.includes("not found") || normalized.includes("fetch failed")) {
    return { kind: "cooldown", cooldownMs: 5 * 60_000, reason: message }
  }

  return { kind: "cooldown", cooldownMs: 30_000, reason: message }
}

function retryAfterMs(message: string): number | null {
  const match = /retry in (?:(\d+)m)?(?:(\d+)s)?/.exec(message)
  if (match === null) {
    return null
  }
  const minutes = match[1] === undefined ? 0 : Number(match[1])
  const seconds = match[2] === undefined ? 0 : Number(match[2])
  const ms = (minutes * 60 + seconds) * 1000
  return ms > 0 ? ms : null
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
