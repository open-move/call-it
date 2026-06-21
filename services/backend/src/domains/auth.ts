import { createRemoteJWKSet, decodeJwt, jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import type { Config } from "../config.ts";
import type { UserRow } from "../db/schema.ts";
import { logger } from "../logger.ts";

// Identity boundary: verify the JWT minted by Dynamic (the client's auth
// provider), then mint our OWN short-lived backend session JWT. The Dynamic
// JWT is a bearer credential that can drain a wallet — it is NEVER logged or
// persisted (see SECURITY note below). Only the backend JWT becomes a session.

const REQUIRED_SCOPE = "user:basic";

// Dynamic `verified_credentials[]` entry. Open-ended formats; we only act on
// `blockchain` entries, but keep the rest so claim parsing never rejects a
// valid token just because a new format appears.
const verifiedCredentialSchema = z
  .object({
    address: z.string().optional(),
    chain: z.string().optional(),
    format: z.string(),
    id: z.string().optional(),
    nameService: z.unknown().optional(),
    publicIdentifier: z.string().optional(),
    walletProvider: z.string().optional(),
  })
  .passthrough();

// Claims we consume from the Dynamic JWT. `scope` is space-separated.
const dynamicClaimsSchema = z
  .object({
    alias: z.string().optional(),
    email: z.string().optional(),
    family_name: z.string().optional(),
    given_name: z.string().optional(),
    scope: z.string().optional(),
    sub: z.string().min(1),
    verified_credentials: z.array(verifiedCredentialSchema).optional(),
  })
  .passthrough();

export type DynamicClaims = z.infer<typeof dynamicClaimsSchema>;

export interface SuiWallet {
  address: string;
  chain: string;
}

export interface BackendSession {
  username: string | null;
  userId: string;
  wallets: string[];
}

const backendClaimsSchema = z.object({
  sub: z.string().min(1),
  username: z.string().nullable().optional(),
  wallets: z.array(z.string()),
});

// Cache the remote JWKS at module scope: `createRemoteJWKSet` handles fetching,
// caching, and rotating keys (refetch on an unknown `kid`) internally.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedJwksUrl: string | undefined;

function getJwks(config: Config): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJwks === undefined || cachedJwksUrl !== config.dynamicJwksUrl) {
    cachedJwks = createRemoteJWKSet(new URL(config.dynamicJwksUrl));
    cachedJwksUrl = config.dynamicJwksUrl;
  }

  return cachedJwks;
}

// Tracks chain strings we've already warned about so the "confirm the Sui
// chain string" warning fires once per distinct value, not per request.
const warnedChains = new Set<string>();

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// Decode the token's claimed iss/aud WITHOUT verifying — for diagnostics only
// (so an iss/aud mismatch is logged). Never used to authorize anything.
function safeDecodeClaims(token: string): { aud?: unknown; iss?: unknown } {
  try {
    const payload = decodeJwt(token);
    return { aud: payload.aud, iss: payload.iss };
  } catch {
    return {};
  }
}

// Verify a Dynamic-issued JWT. Throws AuthError on any failure. NEVER log the
// raw token here or anywhere — it is a wallet-draining credential.
export async function verifyDynamicJwt(
  token: string,
  config: Config,
): Promise<DynamicClaims> {
  const jwks = getJwks(config);
  let payload: unknown;
  try {
    const result = await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
      issuer: config.dynamicIssuer,
    });
    payload = result.payload;
  } catch (error) {
    // Log only the verification reason + the token's claimed iss/aud (never the
    // token, never the signature) so an iss/aud mismatch is diagnosable.
    const claimed = safeDecodeClaims(token);
    logger.warn(
      {
        actualAud: claimed.aud,
        actualIss: claimed.iss,
        expectedIss: config.dynamicIssuer,
        reason: error instanceof Error ? error.message : String(error),
      },
      "dynamic jwt verification failed",
    );
    throw new AuthError(
      `dynamic jwt verification failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const claims = dynamicClaimsSchema.parse(payload);

  // Scope gate (critical): confirms the user fully completed authentication.
  // Reject MFA-pending / intermediate scopes that lack `user:basic`.
  const scopes = (claims.scope ?? "").split(" ");
  if (!scopes.includes(REQUIRED_SCOPE)) {
    logger.warn({ scope: claims.scope ?? null }, "dynamic jwt missing user:basic scope");
    throw new AuthError(`dynamic jwt missing required scope ${REQUIRED_SCOPE}`);
  }

  return claims;
}

// Extract Sui wallets from verified blockchain credentials. Prefer entries
// whose chain matches /sui/i; if none match but blockchain VCs exist, return
// them anyway (don't silently drop wallets) and warn the distinct chain values
// once so the exact Sui chain string can be confirmed.
export function extractSuiWallets(claims: DynamicClaims): SuiWallet[] {
  const blockchainVcs = (claims.verified_credentials ?? []).filter(
    (vc) => vc.format === "blockchain" && typeof vc.address === "string",
  );

  const suiVcs = blockchainVcs.filter(
    (vc) => vc.chain !== undefined && /sui/i.test(vc.chain),
  );

  const source = suiVcs.length > 0 ? suiVcs : blockchainVcs;

  if (suiVcs.length === 0 && blockchainVcs.length > 0) {
    const distinctChains = [
      ...new Set(blockchainVcs.map((vc) => vc.chain ?? "unknown")),
    ];
    const novel = distinctChains.filter((chain) => !warnedChains.has(chain));
    if (novel.length > 0) {
      for (const chain of novel) {
        warnedChains.add(chain);
      }
      logger.warn(
        { chains: novel },
        "no verified_credentials matched /sui/i; storing blockchain wallets under their reported chain",
      );
    }
  }

  return source.map((vc) => ({
    // address is guaranteed by the filter above.
    address: (vc.address as string).toLowerCase(),
    chain: vc.chain ?? "sui",
  }));
}

// Mint our backend session JWT (HS256). Short-lived; carries the resolved
// userId, current username, and linked wallet addresses for cheap authz reads.
export async function issueBackendJwt(
  user: UserRow,
  wallets: string[],
  config: Config,
): Promise<string> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  return new SignJWT({ username: user.username, wallets })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${config.jwtTtlSeconds}s`)
    .sign(secret);
}

// Verify a backend session JWT and return the derived session. Throws
// AuthError on any failure (expired, bad signature, malformed claims).
export async function verifyBackendJwt(
  token: string,
  config: Config,
): Promise<BackendSession> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  let payload: unknown;
  try {
    const result = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    payload = result.payload;
  } catch (error) {
    throw new AuthError(
      `session jwt verification failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const claims = backendClaimsSchema.parse(payload);
  return {
    username: claims.username ?? null,
    userId: claims.sub,
    wallets: claims.wallets,
  };
}
