import type { SuiClientTypes } from "@mysten/sui/client";
import { z } from "zod";

export interface Config {
  arenaObjectId: string;
  arenaPackageId: string;
  databaseUrl: string;
  ingestMaxCheckpointsPerScan: number;
  ingestPollSeconds: number;
  ingestStartCheckpoint: bigint | null;
  port: number;
  predictObjectId: string;
  predictPackageId: string;
  predictServerUrl: string;
  suiNetwork: SuiClientTypes.Network;
  suiRpcUrl: string;
}

const optionalEnvString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().optional());

const requiredEnvString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().min(1));

const optionalBigintString = optionalEnvString
  .pipe(z.string().regex(/^\d+$/).optional())
  .transform((value) => (value === undefined ? null : BigInt(value)));

function envString(defaultValue: string) {
  return optionalEnvString.transform((value) => value ?? defaultValue);
}

function envPositiveInteger(defaultValue: number) {
  return optionalEnvString
    .pipe(z.string().regex(/^\d+$/).optional())
    .transform((value) => (value === undefined ? defaultValue : Number(value)))
    .pipe(z.number().int().positive());
}

const configSchema = z
  .object({
    ARENA_OBJECT_ID: requiredEnvString.transform((value) =>
      value.toLowerCase(),
    ),
    ARENA_PACKAGE_ID: requiredEnvString.transform((value) =>
      value.toLowerCase(),
    ),
    DATABASE_URL: requiredEnvString,
    INGEST_MAX_CHECKPOINTS_PER_SCAN: envPositiveInteger(25),
    INGEST_POLL_SECONDS: envPositiveInteger(15),
    INGEST_START_CHECKPOINT: optionalBigintString,
    PORT: envPositiveInteger(8080),
    PREDICT_OBJECT_ID: requiredEnvString,
    PREDICT_PACKAGE_ID: requiredEnvString.transform((value) =>
      value.toLowerCase(),
    ),
    PREDICT_SERVER_URL: envString(
      "https://predict-server.testnet.mystenlabs.com",
    ),
    SUI_NETWORK: envString("testnet").transform(
      (value) => value as SuiClientTypes.Network,
    ),
    SUI_RPC_URL: envString("https://fullnode.testnet.sui.io:443"),
  })
  .transform(
    (env): Config => ({
      arenaObjectId: env.ARENA_OBJECT_ID,
      arenaPackageId: env.ARENA_PACKAGE_ID,
      databaseUrl: env.DATABASE_URL,
      ingestMaxCheckpointsPerScan: env.INGEST_MAX_CHECKPOINTS_PER_SCAN,
      ingestPollSeconds: env.INGEST_POLL_SECONDS,
      ingestStartCheckpoint: env.INGEST_START_CHECKPOINT,
      port: env.PORT,
      predictObjectId: env.PREDICT_OBJECT_ID,
      predictPackageId: env.PREDICT_PACKAGE_ID,
      predictServerUrl: env.PREDICT_SERVER_URL,
      suiNetwork: env.SUI_NETWORK,
      suiRpcUrl: env.SUI_RPC_URL,
    }),
  );

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): Config {
  return configSchema.parse(env);
}
