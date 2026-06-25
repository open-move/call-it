import { SuiGrpcClient } from "@mysten/sui/grpc"
import { z } from "zod"

import type { Config } from "../config.ts"
import { logger, toLogFields } from "../logger.ts"

type LedgerGetServiceInfo = SuiGrpcClient["ledgerService"]["getServiceInfo"]
type LedgerGetCheckpoint = SuiGrpcClient["ledgerService"]["getCheckpoint"]
type SubscribeCheckpoints = SuiGrpcClient["subscriptionService"]["subscribeCheckpoints"]

type RotatingUnaryCall<T> = {
  response: Promise<T>
}

export interface SuiClient {
  getObject: SuiGrpcClient["getObject"]
  ledgerService: {
    getCheckpoint: (
      input: Parameters<LedgerGetCheckpoint>[0],
      options?: Parameters<LedgerGetCheckpoint>[1]
    ) => RotatingUnaryCall<Awaited<ReturnType<LedgerGetCheckpoint>["response"]>>
    getServiceInfo: (
      input: Parameters<LedgerGetServiceInfo>[0],
      options?: Parameters<LedgerGetServiceInfo>[1]
    ) => RotatingUnaryCall<Awaited<ReturnType<LedgerGetServiceInfo>["response"]>>
  }
  subscriptionService: {
    subscribeCheckpoints: SubscribeCheckpoints
  }
}

interface SuiEndpoint {
  client: SuiGrpcClient
  cooldownUntil: number
  disabledReason: string | null
  url: string
}

const protobufJsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      kind: z.union([
        z.object({ boolValue: z.boolean(), oneofKind: z.literal("boolValue") }).transform((value) => value.boolValue),
        z
          .object({ listValue: z.object({ values: z.array(protobufJsonValueSchema) }), oneofKind: z.literal("listValue") })
          .transform((value) => value.listValue.values),
        z.object({ nullValue: z.unknown().optional(), oneofKind: z.literal("nullValue") }).transform(() => null),
        z.object({ numberValue: z.number(), oneofKind: z.literal("numberValue") }).transform((value) => value.numberValue),
        z.object({ oneofKind: z.literal("stringValue"), stringValue: z.string() }).transform((value) => value.stringValue),
        z
          .object({
            oneofKind: z.literal("structValue"),
            structValue: z.object({ fields: z.record(z.string(), protobufJsonValueSchema) }),
          })
          .transform((value) => value.structValue.fields),
        z.object({ oneofKind: z.undefined() }).transform(() => null),
      ]),
    })
    .transform((value) => value.kind)
)

export function createSuiClient(config: Config): SuiClient {
  return new RotatingSuiClient(config)
}

class RotatingSuiClient implements SuiClient {
  private current = 0
  private readonly endpoints: SuiEndpoint[]

  readonly getObject: SuiGrpcClient["getObject"] = ((input) =>
    this.withEndpointRetry((client) => client.getObject(input), "getObject")) as SuiGrpcClient["getObject"]

  readonly ledgerService: SuiClient["ledgerService"] = {
    getCheckpoint: (input, options) => ({
      response: this.withEndpointRetry(
        (client) => client.ledgerService.getCheckpoint(input, options).response,
        "ledger.getCheckpoint"
      ),
    }),
    getServiceInfo: (input, options) => ({
      response: this.withEndpointRetry(
        (client) => client.ledgerService.getServiceInfo(input, options).response,
        "ledger.getServiceInfo"
      ),
    }),
  }

  readonly subscriptionService: SuiClient["subscriptionService"] = {
    subscribeCheckpoints: ((...args: Parameters<SubscribeCheckpoints>) => {
      let lastError: unknown = null
      for (let attempt = 0; attempt < this.endpoints.length; attempt += 1) {
        const endpoint = this.nextEndpoint(lastError)
        try {
          logger.info(toLogFields({ url: endpoint.url }), "opening Sui checkpoint stream")
          const call = endpoint.client.subscriptionService.subscribeCheckpoints(...args)
          return {
            ...call,
            responses: wrapResponses(call.responses, (error) => {
              this.markEndpointFailure(endpoint, "subscription.subscribeCheckpoints", error)
            }),
          } as ReturnType<SubscribeCheckpoints>
        } catch (error) {
          lastError = error
          this.markEndpointFailure(endpoint, "subscription.subscribeCheckpoints", error)
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError))
    }) as SubscribeCheckpoints,
  }

  constructor(config: Config) {
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

function wrapResponses<T>(responses: AsyncIterable<T>, onError: (error: unknown) => void): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = responses[Symbol.asyncIterator]()
      return {
        async next() {
          try {
            return await iterator.next()
          } catch (error) {
            onError(error)
            throw error
          }
        },
      }
    },
  }
}

export function protobufValueToJson(value: unknown): unknown {
  return value === undefined ? null : protobufJsonValueSchema.parse(value)
}
