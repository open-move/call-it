import type { SuiClientTypes } from "@mysten/sui/client"
import { z } from "zod"

export interface Config {
  clockObjectId: string
  dbPath: string
  dryRun: boolean
  httpPort: number
  maxBatchSize: number
  maxCheckpointsPerScan: number
  minPayout: bigint
  minSuiBalance: bigint
  pollSeconds: number
  predictObjectId: string
  predictPackageId: string
  predictQuoteAsset: string
  redeemKey: string | null
  rewardCoinType: string
  rewardPackageId: string | null
  rewardVaultId: string | null
  startCheckpoint: bigint | null
  startFromLatest: boolean
  statusCorsOrigin: string | null
  statusToken: string | null
  suiNetwork: SuiClientTypes.Network
  suiRpcUrl: string
  suiRpcUrls: string[]
}

const SUI_NETWORKS = ["devnet", "localnet", "mainnet", "testnet"] as const

const optionalEnvString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}, z.string().optional())

const requiredEnvString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}, z.string().min(1))

const optionalBigintString = optionalEnvString
  .pipe(z.string().regex(/^\d+$/).optional())
  .transform((value) => (value === undefined ? null : BigInt(value)))

function envString(defaultValue: string) {
  return optionalEnvString.transform((value) => value ?? defaultValue)
}

function envBoolean(defaultValue: boolean) {
  return optionalEnvString
    .pipe(z.enum(["true", "false"]).optional())
    .transform((value) => (value === undefined ? defaultValue : value === "true"))
}

function envPositiveInteger(defaultValue: number) {
  return optionalEnvString
    .pipe(z.string().regex(/^\d+$/).optional())
    .transform((value) => (value === undefined ? defaultValue : Number(value)))
    .pipe(z.number().int().positive())
}

function envBigint(defaultValue: bigint) {
  return optionalBigintString.transform((value) => value ?? defaultValue)
}

const optionalAddress = optionalEnvString.transform((value) =>
  value === undefined ? null : value.toLowerCase()
)

const optionalRpcUrls = optionalEnvString.transform((value) =>
  value === undefined
    ? null
    : value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map(normalizeSuiRpcUrl)
)

const configSchema = z
  .object({
    CLOCK_OBJECT_ID: envString("0x6"),
    KEEPER_DB_PATH: envString("./data/keeper.sqlite"),
    KEEPER_DRY_RUN: envBoolean(true),
    KEEPER_HTTP_PORT: envPositiveInteger(8801),
    KEEPER_MAX_BATCH_SIZE: envPositiveInteger(10),
    KEEPER_MAX_CHECKPOINTS_PER_SCAN: envPositiveInteger(25),
    KEEPER_MIN_PAYOUT: envBigint(1n),
    KEEPER_MIN_SUI_BALANCE: envBigint(50_000_000n),
    KEEPER_POLL_SECONDS: envPositiveInteger(15),
    KEEPER_REWARD_COIN_TYPE: optionalEnvString,
    KEEPER_REWARD_PACKAGE_ID: optionalAddress,
    KEEPER_REWARD_VAULT_ID: optionalAddress,
    KEEPER_START_CHECKPOINT: optionalBigintString,
    KEEPER_START_FROM_LATEST: envBoolean(false),
    KEEPER_STATUS_CORS_ORIGIN: optionalEnvString.transform((value) => value ?? null),
    KEEPER_STATUS_TOKEN: optionalEnvString.transform((value) => value ?? null),
    PREDICT_OBJECT_ID: requiredEnvString,
    PREDICT_PACKAGE_ID: requiredEnvString.transform((value) => value.toLowerCase()),
    PREDICT_QUOTE_ASSET: requiredEnvString,
    SUI_KEEPER_REDEEM_KEY: optionalEnvString.transform((value) => value ?? null),
    SUI_NETWORK: optionalEnvString
      .pipe(z.enum(SUI_NETWORKS).optional())
      .transform((value): SuiClientTypes.Network => value ?? "testnet"),
    SUI_RPC_URL: envString("https://fullnode.testnet.sui.io:443"),
    SUI_RPC_URLS: optionalRpcUrls,
  })
  .transform(
    (env): Config => {
      const suiRpcUrl = normalizeSuiRpcUrl(env.SUI_RPC_URL)
      return {
        clockObjectId: env.CLOCK_OBJECT_ID,
        dbPath: env.KEEPER_DB_PATH,
        dryRun: env.KEEPER_DRY_RUN,
        httpPort: env.KEEPER_HTTP_PORT,
        maxBatchSize: env.KEEPER_MAX_BATCH_SIZE,
        maxCheckpointsPerScan: env.KEEPER_MAX_CHECKPOINTS_PER_SCAN,
        minPayout: env.KEEPER_MIN_PAYOUT,
        minSuiBalance: env.KEEPER_MIN_SUI_BALANCE,
        pollSeconds: env.KEEPER_POLL_SECONDS,
        predictObjectId: env.PREDICT_OBJECT_ID,
        predictPackageId: env.PREDICT_PACKAGE_ID,
        predictQuoteAsset: env.PREDICT_QUOTE_ASSET,
        redeemKey: env.SUI_KEEPER_REDEEM_KEY,
        // The reward vault is created with the quote asset (DUSDC) as its reward
        // coin, so default to that unless explicitly overridden.
        rewardCoinType: env.KEEPER_REWARD_COIN_TYPE ?? env.PREDICT_QUOTE_ASSET,
        rewardPackageId: env.KEEPER_REWARD_PACKAGE_ID,
        rewardVaultId: env.KEEPER_REWARD_VAULT_ID,
        startCheckpoint: env.KEEPER_START_CHECKPOINT,
        startFromLatest: env.KEEPER_START_FROM_LATEST,
        statusCorsOrigin: env.KEEPER_STATUS_CORS_ORIGIN,
        statusToken: env.KEEPER_STATUS_TOKEN,
        suiNetwork: env.SUI_NETWORK,
        suiRpcUrl,
        suiRpcUrls: dedupe([...(env.SUI_RPC_URLS ?? []), suiRpcUrl]),
      }
    }
  )
  .refine((config) => config.rewardVaultId === null || config.rewardPackageId !== null, {
    error: "KEEPER_REWARD_PACKAGE_ID is required when KEEPER_REWARD_VAULT_ID is set",
  })

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(env)
}

export function normalizeSuiRpcUrl(value: string): string {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  const url = new URL(withScheme)
  if (url.protocol === "http:" && url.port === "443") {
    url.protocol = "https:"
  }
  return url.toString().replace(/\/$/, "")
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}
