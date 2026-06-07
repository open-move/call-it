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

export const SHIELD_PACKAGE_ID =
  "0x1d00ca1442e0d989dcd74f6276dd66760e76c9c5e7f447e1d701644ca37a79da"

export const SHIELD_ORIGINAL_PACKAGE_ID = SHIELD_PACKAGE_ID

export const SUI_GRPC_URL = "https://fullnode.testnet.sui.io:443"

export const SUI_NETWORK = "testnet"
