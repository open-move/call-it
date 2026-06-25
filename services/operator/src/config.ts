import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"

export interface PredictConfig {
  clockObjectId: string
  packageId: string
  quoteAsset: string
  roundEntryMaxMsToExpiry: number
  roundEntryMinMsToExpiry: number
  roundIntervalMs: number
  roundIntervalToleranceMs: number
  roundUnderlyingAsset: string
  serverUrl: string
  sharedObjectId: string
}

export interface BaseVaultConfig {
  packageId: string
  vaultId: string
}

export interface HedgedPlpConfig {
  enabled: boolean
  hedgeQuantityBpsOfNav: number
  keeperCapId: string
  managerId: string
  packageId: string
  strikeSpotBps: number
  strategyId: string
}

export interface RangeLadderConfig {
  enabled: boolean
  keeperCapId: string
  managerId: string
  packageId: string
  quantityBpsOfNav: number
  rungCount: number
  rungWidthBps: number
  strategyId: string
}

export interface BullishUpsideConfig {
  enabled: boolean
  keeperCapId: string
  managerId: string
  packageId: string
  quantityBpsOfNav: number
  strikeSpotBps: number
  strategyId: string
}

/** Dual-leg vaults (a down leg below spot + an up leg above spot). */
export interface DualLegConfig {
  enabled: boolean
  keeperCapId: string
  managerId: string
  packageId: string
  quantityBpsOfNav: number
  strikeWidthBps: number
  strategyId: string
}

export interface OperatorConfig {
  baseVault: BaseVaultConfig
  bullishUpside: BullishUpsideConfig
  dryRun: boolean
  hedgedPlp: HedgedPlpConfig
  plpCollar: DualLegConfig
  pollSeconds: number
  predict: PredictConfig
  rangeLadder: RangeLadderConfig
  strangle: DualLegConfig
  suiNetwork: SuiNetwork
  suiRpcUrl: string
  suiRpcUrls: string[]
}

const SUI_NETWORKS = ["devnet", "localnet", "mainnet", "testnet"] as const
type SuiNetwork = (typeof SUI_NETWORKS)[number]

// === Env helpers (trim, default, then validate) ===

function envString(defaultValue: string) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : defaultValue),
    z.string()
  )
}

function envNumber(defaultValue: number) {
  return z.preprocess((value) => {
    if (typeof value !== "string" || value.trim() === "") {
      return defaultValue
    }
    const parsed = Number(value.trim())
    // Leave an unparseable value as a string so z.number() reports it by name.
    return Number.isFinite(parsed) ? parsed : value.trim()
  }, z.number().finite())
}

function envBoolean(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (typeof value !== "string" || value.trim() === "") {
      return defaultValue
    }
    const normalized = value.trim().toLowerCase()
    if (["1", "true", "yes", "y"].includes(normalized)) {
      return true
    }
    if (["0", "false", "no", "n"].includes(normalized)) {
      return false
    }
    return normalized
  }, z.boolean())
}

const optionalRpcUrls = z.preprocess((value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map(normalizeSuiRpcUrl)
}, z.array(z.string()).nullable())

const envSchema = z
  .object({
    SUI_NETWORK: z.preprocess(
      (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : "testnet"),
      z.enum(SUI_NETWORKS)
    ),
    SUI_RPC_URL: envString("https://fullnode.testnet.sui.io:443"),
    SUI_RPC_URLS: optionalRpcUrls,
    CLOCK_OBJECT_ID: envString("0x6"),
    PREDICT_PACKAGE_ID: envString("0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138"),
    PREDICT_OBJECT_ID: envString("0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a"),
    PREDICT_QUOTE_ASSET: envString(
      "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC"
    ),
    PREDICT_SERVER_URL: envString("https://predict-server.testnet.mystenlabs.com").transform((value) =>
      value.replace(/\/$/, "")
    ),
    PREDICT_ROUND_UNDERLYING_ASSET: envString("BTC"),
    PREDICT_ROUND_ENTRY_MAX_MS_TO_EXPIRY: envNumber(90 * 60_000),
    PREDICT_ROUND_ENTRY_MIN_MS_TO_EXPIRY: envNumber(75 * 60_000),
    PREDICT_ROUND_INTERVAL_MS: envNumber(2 * 60 * 60_000),
    PREDICT_ROUND_INTERVAL_TOLERANCE_MS: envNumber(5 * 60_000),
    DRY_RUN: envBoolean(false),
    POLL_SECONDS: envNumber(60),
    HEDGED_PLP_ENABLED: envBoolean(true),
    HEDGED_PLP_HEDGE_QUANTITY_BPS_OF_NAV: envNumber(250),
    HEDGED_PLP_STRIKE_SPOT_BPS: envNumber(9_900),
    RANGE_LADDER_ENABLED: envBoolean(true),
    RANGE_QUANTITY_BPS_OF_NAV: envNumber(250),
    RANGE_RUNG_COUNT: envNumber(2),
    RANGE_RUNG_WIDTH_BPS: envNumber(25),
    BULLISH_UPSIDE_ENABLED: envBoolean(true),
    BULLISH_UPSIDE_QUANTITY_BPS_OF_NAV: envNumber(250),
    BULLISH_UPSIDE_STRIKE_SPOT_BPS: envNumber(10_100),
    PLP_COLLAR_ENABLED: envBoolean(true),
    PLP_COLLAR_QUANTITY_BPS_OF_NAV: envNumber(250),
    PLP_COLLAR_STRIKE_WIDTH_BPS: envNumber(100),
    STRANGLE_ENABLED: envBoolean(true),
    STRANGLE_QUANTITY_BPS_OF_NAV: envNumber(250),
    STRANGLE_STRIKE_WIDTH_BPS: envNumber(100),
    OPERATOR_DEPLOYMENT_PATH: z.preprocess(
      (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined),
      z.string().optional()
    ),
  })
  .refine((env) => env.PREDICT_ROUND_INTERVAL_MS > 0, {
    error: "PREDICT_ROUND_INTERVAL_MS must be positive",
  })
  .refine((env) => env.PREDICT_ROUND_INTERVAL_TOLERANCE_MS >= 0, {
    error: "PREDICT_ROUND_INTERVAL_TOLERANCE_MS must be non-negative",
  })
  .refine((env) => env.PREDICT_ROUND_ENTRY_MIN_MS_TO_EXPIRY >= 0, {
    error: "PREDICT_ROUND_ENTRY_MIN_MS_TO_EXPIRY must be non-negative",
  })
  .refine((env) => env.PREDICT_ROUND_ENTRY_MAX_MS_TO_EXPIRY >= env.PREDICT_ROUND_ENTRY_MIN_MS_TO_EXPIRY, {
    error: "PREDICT_ROUND_ENTRY_MAX_MS_TO_EXPIRY must be >= PREDICT_ROUND_ENTRY_MIN_MS_TO_EXPIRY",
  })

// === Deployment file (source of truth for on-chain ids) ===

const objectId = z.string().regex(/^0x[0-9a-fA-F]+$/, "must be a 0x-prefixed hex object id")

const deploymentSchema = z.object({
  network: z.enum(SUI_NETWORKS),
  baseVault: z.object({ capId: objectId, packageId: objectId, vaultId: objectId }),
  hedgedPlp: z.object({
    adminCapId: objectId,
    keeperCapId: objectId,
    managerId: objectId,
    packageId: objectId,
    strategyId: objectId,
  }),
  rangeLadder: z.object({
    adminCapId: objectId,
    keeperCapId: objectId,
    managerId: objectId,
    packageId: objectId,
    strategyId: objectId,
  }),
  bullishUpside: z.object({
    adminCapId: objectId,
    keeperCapId: objectId,
    managerId: objectId,
    packageId: objectId,
    strategyId: objectId,
  }),
  plpCollar: z.object({
    adminCapId: objectId,
    keeperCapId: objectId,
    managerId: objectId,
    packageId: objectId,
    strategyId: objectId,
  }),
  strangle: z.object({
    adminCapId: objectId,
    keeperCapId: objectId,
    managerId: objectId,
    packageId: objectId,
    strategyId: objectId,
  }),
  deployer: objectId.optional(),
  operator: objectId.optional(),
})

type Deployment = z.infer<typeof deploymentSchema>

function loadDeployment(network: SuiNetwork, explicitPath: string | undefined): Deployment {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const path = explicitPath ?? resolve(packageRoot, `deployment.${network}.json`)

  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    throw new Error(
      `deployment file not found at ${path}; set OPERATOR_DEPLOYMENT_PATH or run \`bun run deploy\` for ${network}`
    )
  }

  const deployment = deploymentSchema.parse(JSON.parse(raw) as unknown)
  if (deployment.network !== network) {
    throw new Error(`deployment network ${deployment.network} does not match SUI_NETWORK ${network}`)
  }

  return deployment
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OperatorConfig {
  const parsed = envSchema.parse(env)
  const deployment = loadDeployment(parsed.SUI_NETWORK, parsed.OPERATOR_DEPLOYMENT_PATH)
  const suiRpcUrl = normalizeSuiRpcUrl(parsed.SUI_RPC_URL)

  return {
    baseVault: {
      packageId: deployment.baseVault.packageId,
      vaultId: deployment.baseVault.vaultId,
    },
    bullishUpside: {
      enabled: parsed.BULLISH_UPSIDE_ENABLED,
      keeperCapId: deployment.bullishUpside.keeperCapId,
      managerId: deployment.bullishUpside.managerId,
      packageId: deployment.bullishUpside.packageId,
      quantityBpsOfNav: parsed.BULLISH_UPSIDE_QUANTITY_BPS_OF_NAV,
      strikeSpotBps: parsed.BULLISH_UPSIDE_STRIKE_SPOT_BPS,
      strategyId: deployment.bullishUpside.strategyId,
    },
    plpCollar: {
      enabled: parsed.PLP_COLLAR_ENABLED,
      keeperCapId: deployment.plpCollar.keeperCapId,
      managerId: deployment.plpCollar.managerId,
      packageId: deployment.plpCollar.packageId,
      quantityBpsOfNav: parsed.PLP_COLLAR_QUANTITY_BPS_OF_NAV,
      strikeWidthBps: parsed.PLP_COLLAR_STRIKE_WIDTH_BPS,
      strategyId: deployment.plpCollar.strategyId,
    },
    strangle: {
      enabled: parsed.STRANGLE_ENABLED,
      keeperCapId: deployment.strangle.keeperCapId,
      managerId: deployment.strangle.managerId,
      packageId: deployment.strangle.packageId,
      quantityBpsOfNav: parsed.STRANGLE_QUANTITY_BPS_OF_NAV,
      strikeWidthBps: parsed.STRANGLE_STRIKE_WIDTH_BPS,
      strategyId: deployment.strangle.strategyId,
    },
    dryRun: parsed.DRY_RUN,
    pollSeconds: parsed.POLL_SECONDS,
    predict: {
      clockObjectId: parsed.CLOCK_OBJECT_ID,
      packageId: parsed.PREDICT_PACKAGE_ID,
      quoteAsset: parsed.PREDICT_QUOTE_ASSET,
      roundEntryMaxMsToExpiry: parsed.PREDICT_ROUND_ENTRY_MAX_MS_TO_EXPIRY,
      roundEntryMinMsToExpiry: parsed.PREDICT_ROUND_ENTRY_MIN_MS_TO_EXPIRY,
      roundIntervalMs: parsed.PREDICT_ROUND_INTERVAL_MS,
      roundIntervalToleranceMs: parsed.PREDICT_ROUND_INTERVAL_TOLERANCE_MS,
      roundUnderlyingAsset: parsed.PREDICT_ROUND_UNDERLYING_ASSET,
      serverUrl: parsed.PREDICT_SERVER_URL,
      sharedObjectId: parsed.PREDICT_OBJECT_ID,
    },
    rangeLadder: {
      enabled: parsed.RANGE_LADDER_ENABLED,
      keeperCapId: deployment.rangeLadder.keeperCapId,
      managerId: deployment.rangeLadder.managerId,
      packageId: deployment.rangeLadder.packageId,
      quantityBpsOfNav: parsed.RANGE_QUANTITY_BPS_OF_NAV,
      rungCount: parsed.RANGE_RUNG_COUNT,
      rungWidthBps: parsed.RANGE_RUNG_WIDTH_BPS,
      strategyId: deployment.rangeLadder.strategyId,
    },
    hedgedPlp: {
      enabled: parsed.HEDGED_PLP_ENABLED,
      hedgeQuantityBpsOfNav: parsed.HEDGED_PLP_HEDGE_QUANTITY_BPS_OF_NAV,
      keeperCapId: deployment.hedgedPlp.keeperCapId,
      managerId: deployment.hedgedPlp.managerId,
      packageId: deployment.hedgedPlp.packageId,
      strikeSpotBps: parsed.HEDGED_PLP_STRIKE_SPOT_BPS,
      strategyId: deployment.hedgedPlp.strategyId,
    },
    suiNetwork: parsed.SUI_NETWORK,
    suiRpcUrl,
    suiRpcUrls: dedupe([...(parsed.SUI_RPC_URLS ?? []), suiRpcUrl]),
  }
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
