import type { SuiClientTypes } from "@mysten/sui/client"
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography"
import { SuiGrpcClient } from "@mysten/sui/grpc"
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"
import { Ed25519Keypair as Ed25519KeypairValue } from "@mysten/sui/keypairs/ed25519"
import { Transaction } from "@mysten/sui/transactions"
import { z } from "zod"

import type { Config } from "./config.ts"
import { logger, toLogFields } from "./logger.ts"
import type { RedemptionPlan } from "./redemptions.ts"

type LedgerGetServiceInfo = SuiGrpcClient["ledgerService"]["getServiceInfo"]
type LedgerGetCheckpoint = SuiGrpcClient["ledgerService"]["getCheckpoint"]
type SubscribeCheckpoints = SuiGrpcClient["subscriptionService"]["subscribeCheckpoints"]
type SimulateTransaction = SuiGrpcClient["simulateTransaction"]
type SignAndExecuteTransaction = SuiGrpcClient["signAndExecuteTransaction"]
type WaitForTransaction = SuiGrpcClient["waitForTransaction"]
type GetBalance = SuiGrpcClient["getBalance"]

type RotatingUnaryCall<T> = {
  response: Promise<T>
}

export interface SuiClient {
  getBalance: GetBalance
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
  signAndExecuteTransaction: SignAndExecuteTransaction
  simulateTransaction: SimulateTransaction
  subscriptionService: {
    subscribeCheckpoints: SubscribeCheckpoints
  }
  waitForTransaction: WaitForTransaction
}

interface SuiEndpoint {
  client: SuiGrpcClient
  url: string
}

export interface ExecutionResult {
  digest: string
  events: SuiClientTypes.Event[]
}

export interface SimulationResult {
  error: string | null
  ok: boolean
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

export function createSuiClient(config: Config) {
  return new RotatingSuiClient(config)
}

class RotatingSuiClient implements SuiClient {
  private current = 0
  private readonly endpoints: SuiEndpoint[]

  readonly getBalance: GetBalance = ((input) =>
    this.withEndpointRetry((client) => client.getBalance(input), "getBalance")) as GetBalance

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

  readonly signAndExecuteTransaction: SignAndExecuteTransaction = ((input) =>
    this.withEndpointRetry(
      (client) => client.signAndExecuteTransaction(input),
      "signAndExecuteTransaction"
    )) as SignAndExecuteTransaction

  readonly simulateTransaction: SimulateTransaction = ((input) =>
    this.withEndpointRetry((client) => client.simulateTransaction(input), "simulateTransaction")) as SimulateTransaction

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

  readonly waitForTransaction: WaitForTransaction = ((input) =>
    this.withEndpointRetry((client) => client.waitForTransaction(input), "waitForTransaction")) as WaitForTransaction

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

export function loadRedeemKeypair(config: Config) {
  if (config.redeemKey === null) {
    throw new Error("SUI_KEEPER_REDEEM_KEY is required when KEEPER_DRY_RUN=false")
  }

  const { scheme, secretKey } = decodeSuiPrivateKey(config.redeemKey)
  if (scheme !== "ED25519") {
    throw new Error(`Unsupported key scheme ${scheme}; only ED25519 is supported`)
  }

  return Ed25519KeypairValue.fromSecretKey(secretKey)
}

export function protobufValueToJson(value: unknown): unknown {
  return value === undefined ? null : protobufJsonValueSchema.parse(value)
}

const suiBalanceSchema = z
  .object({
    balance: z.object({
      balance: z.string().regex(/^\d+$/).optional(),
      coinBalance: z.string().regex(/^\d+$/).optional(),
    }),
  })
  .transform((response) => BigInt(response.balance.coinBalance ?? response.balance.balance ?? "0"))

export async function getSuiBalance(client: SuiClient, owner: string): Promise<bigint> {
  const response = await client.getBalance({ owner })
  return suiBalanceSchema.parse(response)
}

export function buildRedeemTransaction(
  config: Config,
  plan: RedemptionPlan,
  recipient: string,
  useReward: boolean
) {
  const tx = new Transaction()
  const key = tx.moveCall({
    arguments: [
      tx.pure.id(plan.position.oracleId),
      tx.pure.u64(plan.position.expiry),
      tx.pure.u64(plan.position.strike),
      tx.pure.bool(plan.position.isUp),
    ],
    target: `${config.predictPackageId}::market_key::new`,
  })

  // Reward path: redeem through our reward vault, which redeems the full
  // settled position and returns a keeper reward coin we forward to ourselves.
  // `redeem_with_reward` aborts unless the manager is allow-listed and the vault
  // is funded, so the caller falls back to the plain path when this is off.
  if (useReward && config.rewardVaultId !== null && config.rewardPackageId !== null) {
    const reward = tx.moveCall({
      arguments: [
        tx.object(config.rewardVaultId),
        tx.object(config.predictObjectId),
        tx.object(plan.position.managerId),
        tx.object(plan.position.oracleId),
        key,
        tx.object(config.clockObjectId),
      ],
      target: `${config.rewardPackageId}::reward_vault::redeem_with_reward`,
      typeArguments: [config.predictQuoteAsset, config.rewardCoinType],
    })
    tx.transferObjects([reward], recipient)
    return tx
  }

  tx.moveCall({
    arguments: [
      tx.object(config.predictObjectId),
      tx.object(plan.position.managerId),
      tx.object(plan.position.oracleId),
      key,
      tx.pure.u64(plan.quantity),
      tx.object(config.clockObjectId),
    ],
    target: `${config.predictPackageId}::predict::redeem_permissionless`,
    typeArguments: [config.predictQuoteAsset],
  })

  return tx
}

export async function simulateRedeem(client: SuiClient, transaction: Transaction): Promise<SimulationResult> {
  const result = await client.simulateTransaction({
    checksEnabled: true,
    include: { effects: true, events: true },
    transaction,
  })

  if (result.$kind === "FailedTransaction") {
    return {
      error: result.FailedTransaction.status.error?.message ?? "Simulation failed",
      ok: false,
    }
  }

  return { error: null, ok: true }
}

export async function executeRedeem(
  client: SuiClient,
  signer: Ed25519Keypair,
  transaction: Transaction
): Promise<ExecutionResult> {
  const result = await client.signAndExecuteTransaction({
    include: { effects: true, events: true },
    signer,
    transaction,
  })

  if (result.$kind === "FailedTransaction") {
    throw new Error(result.FailedTransaction.status.error?.message ?? "Transaction failed")
  }

  const finalResult = await client.waitForTransaction({
    include: { effects: true, events: true },
    result,
    timeout: 60_000,
  })

  if (finalResult.$kind === "FailedTransaction") {
    throw new Error(finalResult.FailedTransaction.status.error?.message ?? "Transaction failed")
  }

  return {
    digest: finalResult.Transaction.digest,
    events: finalResult.Transaction.events ?? [],
  }
}
