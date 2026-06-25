import type { SuiClientTypes } from "@mysten/sui/client";
import { z } from "zod";

export interface Config {
  arenaObjectId: string;
  arenaPackageId: string;
  databaseUrl: string;
  dynamicEnvId: string;
  dynamicIssuer: string;
  dynamicJwksUrl: string;
  ingestMaxCheckpointsPerScan: number;
  ingestPollSeconds: number;
  ingestStartCheckpoint: bigint | null;
  jwtSecret: string;
  jwtTtlSeconds: number;
  port: number;
  predictObjectId: string;
  predictPackageId: string;
  predictServerUrl: string;
  strategyObjectIds: StrategyObjectIds;
  strategyPackageIds: StrategyPackageIds;
  suiNetwork: SuiClientTypes.Network;
  suiRpcUrl: string;
}

export interface StrategyPackageIds {
  bullishUpside: string | null;
  hedgedPlp: string | null;
  plpCollar: string | null;
  rangeLadder: string | null;
  strangle: string | null;
}

export interface StrategyObjectIds {
  bullishUpside: string | null;
  hedgedPlp: string | null;
  plpCollar: string | null;
  rangeLadder: string | null;
  strangle: string | null;
}

const DEFAULT_DYNAMIC_ENV_ID = "981f0d75-a958-444d-8eb4-703aa3d30c18";

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

const optionalAddressEnv = optionalEnvString.transform((value) =>
  value === undefined ? null : value.toLowerCase(),
);

const configSchema = z
  .object({
    ARENA_OBJECT_ID: requiredEnvString.transform((value) =>
      value.toLowerCase(),
    ),
    ARENA_PACKAGE_ID: requiredEnvString.transform((value) =>
      value.toLowerCase(),
    ),
    BULLISH_UPSIDE_PACKAGE_ID: optionalAddressEnv,
    BULLISH_UPSIDE_STRATEGY_ID: optionalAddressEnv,
    DATABASE_URL: requiredEnvString,
    DYNAMIC_ENV_ID: envString(DEFAULT_DYNAMIC_ENV_ID),
    DYNAMIC_ISSUER: optionalEnvString,
    DYNAMIC_JWKS_URL: optionalEnvString,
    HEDGED_PLP_PACKAGE_ID: optionalAddressEnv,
    HEDGED_PLP_STRATEGY_ID: optionalAddressEnv,
    INGEST_MAX_CHECKPOINTS_PER_SCAN: envPositiveInteger(25),
    INGEST_POLL_SECONDS: envPositiveInteger(15),
    INGEST_START_CHECKPOINT: optionalBigintString,
    JWT_SECRET: requiredEnvString,
    JWT_TTL_SECONDS: envPositiveInteger(86400),
    PORT: envPositiveInteger(8080),
    PREDICT_OBJECT_ID: requiredEnvString,
    PREDICT_PACKAGE_ID: requiredEnvString.transform((value) =>
      value.toLowerCase(),
    ),
    PREDICT_SERVER_URL: envString(
      "https://predict-server.testnet.mystenlabs.com",
    ),
    PLP_COLLAR_PACKAGE_ID: optionalAddressEnv,
    PLP_COLLAR_STRATEGY_ID: optionalAddressEnv,
    RANGE_LADDER_PACKAGE_ID: optionalAddressEnv,
    RANGE_LADDER_STRATEGY_ID: optionalAddressEnv,
    STRANGLE_PACKAGE_ID: optionalAddressEnv,
    STRANGLE_STRATEGY_ID: optionalAddressEnv,
    SUI_NETWORK: envString("testnet").transform(
      (value) => value as SuiClientTypes.Network,
    ),
    SUI_RPC_URL: envString("https://fullnode.testnet.sui.io:443"),
  })
  .transform((env): Config => {
    const dynamicEnvId = env.DYNAMIC_ENV_ID;
    return {
      arenaObjectId: env.ARENA_OBJECT_ID,
      arenaPackageId: env.ARENA_PACKAGE_ID,
      databaseUrl: env.DATABASE_URL,
      dynamicEnvId,
      // Dynamic issues JWTs from app.dynamicauth.com (the JWKS still lives on
      // app.dynamic.xyz and serves the same kids — verified).
      dynamicIssuer: env.DYNAMIC_ISSUER ?? `app.dynamicauth.com/${dynamicEnvId}`,
      dynamicJwksUrl:
        env.DYNAMIC_JWKS_URL ??
        `https://app.dynamic.xyz/api/v0/sdk/${dynamicEnvId}/.well-known/jwks`,
      ingestMaxCheckpointsPerScan: env.INGEST_MAX_CHECKPOINTS_PER_SCAN,
      ingestPollSeconds: env.INGEST_POLL_SECONDS,
      ingestStartCheckpoint: env.INGEST_START_CHECKPOINT,
      jwtSecret: env.JWT_SECRET,
      jwtTtlSeconds: env.JWT_TTL_SECONDS,
      port: env.PORT,
      predictObjectId: env.PREDICT_OBJECT_ID,
      predictPackageId: env.PREDICT_PACKAGE_ID,
      predictServerUrl: env.PREDICT_SERVER_URL,
      strategyObjectIds: {
        bullishUpside: env.BULLISH_UPSIDE_STRATEGY_ID,
        hedgedPlp: env.HEDGED_PLP_STRATEGY_ID,
        plpCollar: env.PLP_COLLAR_STRATEGY_ID,
        rangeLadder: env.RANGE_LADDER_STRATEGY_ID,
        strangle: env.STRANGLE_STRATEGY_ID,
      },
      strategyPackageIds: {
        bullishUpside: env.BULLISH_UPSIDE_PACKAGE_ID,
        hedgedPlp: env.HEDGED_PLP_PACKAGE_ID,
        plpCollar: env.PLP_COLLAR_PACKAGE_ID,
        rangeLadder: env.RANGE_LADDER_PACKAGE_ID,
        strangle: env.STRANGLE_PACKAGE_ID,
      },
      suiNetwork: env.SUI_NETWORK,
      suiRpcUrl: env.SUI_RPC_URL,
    };
  });

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): Config {
  return configSchema.parse(env);
}
