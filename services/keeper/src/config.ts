import type { SuiClientTypes } from "@mysten/sui/client"
import { z } from "zod"

export interface KeeperConfig {
  clockObjectId: string
  dbPath: string
  dryRun: boolean
  maxBatchSize: number
  maxCheckpointsPerScan: number
  minPayout: bigint
  pollSeconds: number
  predictObjectId: string
  predictPackageId: string
  predictQuoteAsset: string
  redeemKey: string | null
  startCheckpoint: bigint | null
  suiNetwork: SuiClientTypes.Network
  suiRpcUrl: string
}

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

const configSchema = z
  .object({
    CLOCK_OBJECT_ID: envString("0x6"),
    KEEPER_DB_PATH: envString("./data/keeper.sqlite"),
    KEEPER_DRY_RUN: envBoolean(true),
    KEEPER_MAX_BATCH_SIZE: envPositiveInteger(10),
    KEEPER_MAX_CHECKPOINTS_PER_SCAN: envPositiveInteger(25),
    KEEPER_MIN_PAYOUT: envBigint(1n),
    KEEPER_POLL_SECONDS: envPositiveInteger(15),
    KEEPER_START_CHECKPOINT: optionalBigintString,
    PREDICT_OBJECT_ID: requiredEnvString,
    PREDICT_PACKAGE_ID: requiredEnvString.transform((value) => value.toLowerCase()),
    PREDICT_QUOTE_ASSET: requiredEnvString,
    SUI_KEEPER_REDEEM_KEY: optionalEnvString.transform((value) => value ?? null),
    SUI_NETWORK: envString("testnet").transform((value) => value as SuiClientTypes.Network),
    SUI_RPC_URL: envString("https://fullnode.testnet.sui.io:443"),
  })
  .transform(
    (env): KeeperConfig => ({
      clockObjectId: env.CLOCK_OBJECT_ID,
      dbPath: env.KEEPER_DB_PATH,
      dryRun: env.KEEPER_DRY_RUN,
      maxBatchSize: env.KEEPER_MAX_BATCH_SIZE,
      maxCheckpointsPerScan: env.KEEPER_MAX_CHECKPOINTS_PER_SCAN,
      minPayout: env.KEEPER_MIN_PAYOUT,
      pollSeconds: env.KEEPER_POLL_SECONDS,
      predictObjectId: env.PREDICT_OBJECT_ID,
      predictPackageId: env.PREDICT_PACKAGE_ID,
      predictQuoteAsset: env.PREDICT_QUOTE_ASSET,
      redeemKey: env.SUI_KEEPER_REDEEM_KEY,
      startCheckpoint: env.KEEPER_START_CHECKPOINT,
      suiNetwork: env.SUI_NETWORK,
      suiRpcUrl: env.SUI_RPC_URL,
    })
  )

export function loadConfig(env: NodeJS.ProcessEnv = process.env): KeeperConfig {
  return configSchema.parse(env)
}
