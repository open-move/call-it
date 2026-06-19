export interface PredictConfig {
  clockObjectId: string
  packageId: string
  quoteAsset: string
  serverUrl: string
  sharedObjectId: string
}

export interface ShieldConfig {
  capId: string
  enabled: boolean
  hedgeQuantityBpsOfNav: number
  managerId: string
  packageId: string
  strikeSpotBps: number
  vaultId: string
}

export interface RangeLadderConfig {
  capId: string
  enabled: boolean
  managerId: string
  packageId: string
  quantityBpsOfNav: number
  rungCount: number
  rungWidthBps: number
  vaultId: string
}

export interface OperatorConfig {
  dryRun: boolean
  minHorizonMs: number
  pollSeconds: number
  predict: PredictConfig
  rangeLadder: RangeLadderConfig
  shield: ShieldConfig
  suiNetwork: "mainnet" | "testnet" | "devnet" | "localnet"
  suiRpcUrl: string
}

function readEnv(name: string, fallback?: string) {
  const value = process.env[name]

  if (value === undefined || value.trim() === "") {
    if (fallback !== undefined) {
      return fallback
    }

    throw new Error(`${name} is required`)
  }

  return value.trim()
}

function readOptionalEnv(name: string) {
  const value = process.env[name]

  return value === undefined || value.trim() === "" ? "" : value.trim()
}

function readBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name]

  if (value === undefined || value.trim() === "") {
    return fallback
  }

  const normalized = value.trim().toLowerCase()

  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true
  }

  if (["0", "false", "no", "n"].includes(normalized)) {
    return false
  }

  throw new Error(`${name} must be a boolean`)
}

function readNumberEnv(name: string, fallback: number) {
  const value = process.env[name]

  if (value === undefined || value.trim() === "") {
    return fallback
  }

  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`)
  }

  return parsed
}

function readNetwork(): OperatorConfig["suiNetwork"] {
  const network = readEnv("SUI_NETWORK", "testnet")

  if (
    network === "mainnet" ||
    network === "testnet" ||
    network === "devnet" ||
    network === "localnet"
  ) {
    return network
  }

  throw new Error("SUI_NETWORK must be mainnet, testnet, devnet, or localnet")
}

export function loadConfig(): OperatorConfig {
  return {
    dryRun: readBooleanEnv("DRY_RUN", false),
    minHorizonMs: readNumberEnv("MIN_HORIZON_MS", 75 * 60_000),
    pollSeconds: readNumberEnv("POLL_SECONDS", 60),
    predict: {
      clockObjectId: readEnv("CLOCK_OBJECT_ID", "0x6"),
      packageId: readEnv(
        "PREDICT_PACKAGE_ID",
        "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138"
      ),
      quoteAsset: readEnv(
        "PREDICT_QUOTE_ASSET",
        "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC"
      ),
      serverUrl: readEnv(
        "PREDICT_SERVER_URL",
        "https://predict-server.testnet.mystenlabs.com"
      ).replace(/\/$/, ""),
      sharedObjectId: readEnv(
        "PREDICT_OBJECT_ID",
        "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a"
      ),
    },
    rangeLadder: {
      capId: readOptionalEnv("RANGE_LADDER_CAP_ID"),
      enabled: readBooleanEnv("RANGE_LADDER_ENABLED", true),
      managerId: readOptionalEnv("RANGE_LADDER_MANAGER_ID"),
      packageId: readOptionalEnv("RANGE_LADDER_PACKAGE_ID"),
      quantityBpsOfNav: readNumberEnv("RANGE_QUANTITY_BPS_OF_NAV", 250),
      rungCount: readNumberEnv("RANGE_RUNG_COUNT", 3),
      rungWidthBps: readNumberEnv("RANGE_RUNG_WIDTH_BPS", 500),
      vaultId: readOptionalEnv("RANGE_LADDER_VAULT_ID"),
    },
    shield: {
      capId: readOptionalEnv("SHIELD_CAP_ID"),
      enabled: readBooleanEnv("SHIELD_ENABLED", true),
      hedgeQuantityBpsOfNav: readNumberEnv("SHIELD_HEDGE_QUANTITY_BPS_OF_NAV", 250),
      managerId: readOptionalEnv("SHIELD_MANAGER_ID"),
      packageId: readOptionalEnv("CALLIT_VAULTS_PACKAGE_ID"),
      strikeSpotBps: readNumberEnv("SHIELD_STRIKE_SPOT_BPS", 9_900),
      vaultId: readOptionalEnv("SHIELD_VAULT_ID"),
    },
    suiNetwork: readNetwork(),
    suiRpcUrl: readEnv("SUI_RPC_URL", "https://fullnode.testnet.sui.io:443"),
  }
}

export function assertConfigured(label: string, fields: Record<string, string>) {
  const missing = Object.entries(fields)
    .filter(([, value]) => value.trim() === "")
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new Error(`${label} config missing: ${missing.join(", ")}`)
  }
}
