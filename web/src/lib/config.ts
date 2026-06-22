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

export const ARENA_PACKAGE_ID = "0x86f8fd50525cf8aea274b2559886fd1b4bdf2a6c8d1b353ff053548eabdb0dac"

export const ARENA_ROOT_ID = ""

export const ARENA_OBJECT_ID = "0xda927248cef779d5af576962f03b0945e3db292b4153b171c4c9ea4e1df54e92"

// CallIt backend (read/index/aggregate). Build-time env (VITE_*) so local and
// prod point at different hosts; defaults to the local docker-mapped port.
// Empty = not configured → Arena renders empty.
export const BACKEND_URL: string =
  import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8799"

// Settled-redeem keeper status API (read-only ops dashboard). Defaults to the
// local keeper's KEEPER_HTTP_PORT (8801). Empty = treated as offline.
export const KEEPER_API_URL: string =
  import.meta.env.VITE_KEEPER_API_URL ?? "http://localhost:8801"

export const BASE_VAULT_ID =
  "0x725808c6e223395dabf586de6ac3b9051a9c71c9767353bf51ec43b0d0c5789a"

export const SHIELD_PACKAGE_ID = ""

export const SHIELD_ORIGINAL_PACKAGE_ID = SHIELD_PACKAGE_ID

export const PROTECT_PACKAGE_ID =
  "0x831382e100bfc9ad633d34c96ab9fb97283ddfdb6e6d5f1fc995801e6b1eda83"

export const PROTECT_ORIGINAL_PACKAGE_ID = PROTECT_PACKAGE_ID

export const SUI_GRPC_URL = "https://fullnode.testnet.sui.io:443"

export const SUI_NETWORK = "testnet"
