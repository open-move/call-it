export const PREDICT_SERVER_URL =
  "https://predict-server.testnet.mystenlabs.com"

export const PREDICT_OBJECT_ID =
  "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a"

export const PREDICT_PACKAGE_ID =
  "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138"

export const PREDICT_QUOTE_ASSET =
  "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC"

export const PREDICT_LP_ASSET = `${PREDICT_PACKAGE_ID}::plp::PLP`

export const PREDICT_CLOCK_ID = "0x6"

export const PREDICT_QUOTE_DECIMALS = 6

export const QUOTE_SCALE = 10 ** PREDICT_QUOTE_DECIMALS

export const QUOTE_QUANTITY = 10n ** BigInt(PREDICT_QUOTE_DECIMALS)

export const PREDICT_PRICE_SCALE = 1_000_000_000

export const ARENA_PACKAGE_ID = ""

export const ARENA_ROOT_ID = ""

export const ARENA_OBJECT_ID = ""

export const BASE_VAULT_ID = ""

export const HEDGED_PLP_PACKAGE_ID =
  "0x1105d7a9fee8a12073d8c9c5cd4253fb9a317d0e209a50df4c0d8c1e504f2f44"

export const HEDGED_PLP_STRATEGY_ID = ""

export const HEDGED_PLP_SHARE_ASSET = `${HEDGED_PLP_PACKAGE_ID}::hedged_plp_strategy::HEDGED_PLP_STRATEGY`

export const SHIELD_PACKAGE_ID = ""

export const SHIELD_ORIGINAL_PACKAGE_ID = SHIELD_PACKAGE_ID

export const PROTECT_PACKAGE_ID =
  "0x831382e100bfc9ad633d34c96ab9fb97283ddfdb6e6d5f1fc995801e6b1eda83"

export const PROTECT_ORIGINAL_PACKAGE_ID = PROTECT_PACKAGE_ID

export const RANGE_LADDER_PACKAGE_ID =
  "0xbbf0eab6b1bae39d75cd63f54301c81d2ddb63032528864c0c7cb06727a8fb14"

export const RANGE_LADDER_ORIGINAL_PACKAGE_ID = RANGE_LADDER_PACKAGE_ID

export const RANGE_LADDER_STRATEGY_ID = ""

export const RANGE_LADDER_SHARE_ASSET = `${RANGE_LADDER_PACKAGE_ID}::range_ladder_strategy::RANGE_LADDER_STRATEGY`

export const SUI_GRPC_URL = "https://fullnode.testnet.sui.io:443"

export const SUI_NETWORK = "testnet"
