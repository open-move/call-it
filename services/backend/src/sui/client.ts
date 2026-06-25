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
        const endpoint = this.nextEndpoint()
        try {
          logger.info(toLogFields({ url: endpoint.url }), "opening Sui checkpoint stream")
          return endpoint.client.subscriptionService.subscribeCheckpoints(...args)
        } catch (error) {
          lastError = error
          this.logEndpointFailure("subscription.subscribeCheckpoints", endpoint.url, error)
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
      url,
    }))
    if (this.endpoints.length === 0) {
      throw new Error("at least one Sui RPC URL is required")
    }
  }

  private async withEndpointRetry<T>(run: (client: SuiGrpcClient) => Promise<T>, operation: string): Promise<T> {
    let lastError: unknown = null
    for (let attempt = 0; attempt < this.endpoints.length; attempt += 1) {
      const endpoint = this.nextEndpoint()
      try {
        return await run(endpoint.client)
      } catch (error) {
        lastError = error
        this.logEndpointFailure(operation, endpoint.url, error)
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private nextEndpoint(): SuiEndpoint {
    const endpoint = this.endpoints[this.current]
    if (endpoint === undefined) {
      throw new Error("no Sui RPC endpoint configured")
    }
    this.current = (this.current + 1) % this.endpoints.length
    return endpoint
  }

  private logEndpointFailure(operation: string, url: string, error: unknown): void {
    logger.warn(
      toLogFields({
        error: error instanceof Error ? error.message : String(error),
        operation,
        url,
      }),
      "Sui RPC endpoint failed; rotating"
    )
  }
}

export function protobufValueToJson(value: unknown): unknown {
  return value === undefined ? null : protobufJsonValueSchema.parse(value)
}
