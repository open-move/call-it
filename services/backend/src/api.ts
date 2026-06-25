import { cors } from "@elysiajs/cors"
import { Elysia } from "elysia"
import { z, ZodError } from "zod"

import type { Config } from "./config.ts"
import { Repository, UsernameConflictError } from "./db/repo.ts"
import type { ArenaCreatorRow, UserRow, WalletRow } from "./db/schema.ts"
import {
  AuthError,
  extractSuiWallets,
  issueBackendJwt,
  verifyBackendJwt,
  verifyDynamicJwt,
} from "./domains/auth.ts"
import type { BackendSession } from "./domains/auth.ts"
import { PredictServerClient } from "./domains/predict-server.ts"
import {
  MAX_METADATA_BYTES,
  canonicalize,
  hashContent,
  metadataByteLength,
  metadataContentTypeSchema,
  metadataWriteContentSchema,
  parseArenaMetadata,
} from "./domains/metadata.ts"
import type {
  ArenaActivityModel,
  ArenaCallModel,
  ArenaCreatorModel,
  ArenaPageModel,
  CreatorIdentity,
  CreatorStats,
  MarketOverlay,
  OracleSettlement,
} from "./domains/leaderboard.ts"
import {
  deriveCreatorStats,
  toActivityModel,
  toCallModel,
  toCreatorModel,
} from "./domains/leaderboard.ts"
import { logger } from "./logger.ts"

const ACTIVITY_LIMIT = 50

const metadataBodySchema = z.object({
  content: metadataWriteContentSchema,
  contentType: z.string().min(1),
  hash: z.string().min(1).optional(),
})

const sessionBodySchema = z.object({
  dynamicJwt: z.string().min(1),
})

// Username rules: 3-20 chars, lowercase letters/digits/underscore. Normalized
// to lowercase before validation so callers may send mixed case.
const usernameSchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9_]{3,20}$/))

const profileBodySchema = z.object({
  avatarUrl: z.string().url().optional(),
  displayName: z.string().min(1).max(80).optional(),
  username: usernameSchema.optional(),
})

interface ProfileResponse {
  user: PublicUser
  wallets: PublicWallet[]
}

interface PublicUser {
  avatarUrl: string | null
  displayName: string | null
  email: string | null
  id: string
  username: string | null
}

interface PublicWallet {
  address: string
  chain: string
  isPrimary: boolean
}

function toPublicUser(user: UserRow): PublicUser {
  return {
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    username: user.username,
  }
}

function toPublicWallet(wallet: WalletRow): PublicWallet {
  return {
    address: wallet.address,
    chain: wallet.chain,
    isPrimary: wallet.isPrimary,
  }
}

interface ArenaCallDetail {
  activity: ArenaActivityModel[]
  call: ArenaCallModel
  creator?: ArenaCreatorModel
}

interface ArenaCreatorDetail {
  calls: ArenaCallModel[]
  creator: ArenaCreatorModel
}

export function buildApi(config: Config, repo: Repository) {
  const predict = new PredictServerClient(config)

  return new Elysia()
    // Browser clients call this cross-origin from the web app; reflect the
    // request origin and allow the Authorization header for authed routes.
    .use(cors())
    .onError(({ code, error, set }) => {
      if (code === "NOT_FOUND") {
        set.status = 404
        return { error: "not_found" }
      }
      if (error instanceof ZodError) {
        set.status = 400
        return { error: "invalid_request" }
      }
      if (error instanceof UsernameConflictError) {
        set.status = 409
        return { error: "username_taken" }
      }
      if (error instanceof AuthError) {
        set.status = 401
        return { error: "unauthorized" }
      }
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "api request failed"
      )
      set.status = 500
      return { error: error instanceof Error ? error.message : "internal_error" }
    })
    .get("/health", () => ({ ok: true }))
    // Login exchange (public): verify the Dynamic JWT, upsert the user + their
    // verified Sui wallets, and mint our own short-lived session JWT. The raw
    // Dynamic JWT is never logged or persisted.
    .post("/auth/session", async ({ body }) => {
      const { dynamicJwt } = sessionBodySchema.parse(body)
      const claims = await verifyDynamicJwt(dynamicJwt, config)
      const suiWallets = extractSuiWallets(claims)
      const { user, wallets } = await repo.upsertUserWithWallets(claims, suiWallets)
      const token = await issueBackendJwt(
        user,
        wallets.map((wallet) => wallet.address),
        config
      )
      return {
        token,
        user: toPublicUser(user),
        wallets: wallets.map(toPublicWallet),
      }
    })
    // Auth layer: read `Authorization: Bearer <token>`, verify the backend
    // session JWT, and expose the derived session as `ctx.session` (null when
    // absent/invalid). Routes that require auth call requireSession(ctx).
    .derive(async ({ headers }): Promise<{ session: BackendSession | null }> => {
      const header = headers.authorization ?? headers.Authorization
      if (typeof header !== "string" || !header.startsWith("Bearer ")) {
        return { session: null }
      }
      const token = header.slice("Bearer ".length).trim()
      if (token.length === 0) {
        return { session: null }
      }
      try {
        return { session: await verifyBackendJwt(token, config) }
      } catch {
        // Invalid/expired tokens resolve to no session; guarded routes 401.
        return { session: null }
      }
    })
    .get("/me", async ({ session }): Promise<ProfileResponse> => {
      const current = requireSession(session)
      const user = await repo.getUserById(current.userId)
      if (user === null) {
        throw new AuthError("user not found")
      }
      const wallets = await repo.listWalletsForUser(user.id)
      return { user: toPublicUser(user), wallets: wallets.map(toPublicWallet) }
    })
    .patch("/me", async ({ session, body }): Promise<ProfileResponse> => {
      const current = requireSession(session)
      const parsed = profileBodySchema.parse(body)
      const user = await repo.setProfile(current.userId, parsed)
      const wallets = await repo.listWalletsForUser(user.id)
      return { user: toPublicUser(user), wallets: wallets.map(toPublicWallet) }
    })
    // The user's arena involvement, joined across all their linked wallet
    // addresses: calls they created + their back/fade participations. Strategy
    // positions land in phase 4.
    .get("/me/positions", async ({ session }) => {
      const current = requireSession(session)
      const wallets = await repo.listWalletsForUser(current.userId)
      const addresses = wallets.map((wallet) => wallet.address)
      const [calls, participations] = await Promise.all([
        repo.listCallsByCreators(addresses),
        repo.listParticipationsByParticipants(addresses),
      ])
      return {
        calls: calls.map((call) => ({
          callId: call.callId,
          createdAtMs: call.createdAtMs,
          creator: call.creator,
          expiry: call.expiry,
          id: call.id,
          isUp: call.isUp,
          strike: call.strike,
        })),
        participations: participations.map((entry) => ({
          callId: entry.callId,
          cost: entry.cost,
          id: entry.id,
          participant: entry.participant,
          quantity: entry.quantity,
          recordedAtMs: entry.recordedAtMs,
          side: entry.side,
        })),
        // TODO(phase-4): user's strategy positions + withdrawal requests.
        strategies: [] as never[],
      }
    })
    .get("/arena", async (): Promise<ArenaPageModel> => {
      const [calls, creators, activityRows, summary] = await Promise.all([
        repo.listCalls(),
        repo.listCreators(),
        repo.listActivity(ACTIVITY_LIMIT),
        repo.summary(),
      ])

      const addresses = [
        ...creators.map((creator) => creator.address),
        ...calls.map((call) => call.creator),
      ]
      const [metaByHash, usersByAddress] = await Promise.all([
        repo.getMetadataMany(addresses),
        repo.usersByAddresses(addresses),
      ])
      const [overlays, oracleStates] = await Promise.all([
        predict.getMarketOverlays(calls.map((call) => call.predictId)),
        predict.getOracleStates(calls.map((call) => call.oracleId)),
      ])
      const creatorStats = deriveCreatorStats(calls, oracleStates)

      const callModels = calls.map((call) =>
        toCallModel(
          call,
          statsFor(creatorStats, call.creator),
          overlayFor(overlays, call.predictId),
          oracleFor(oracleStates, call.oracleId),
          identityFor(usersByAddress, call.creator)
        )
      )
      const creatorModels = creators.map((creator) =>
        toCreatorModel(
          creator,
          creatorMeta(metaByHash, creator.address),
          statsFor(creatorStats, creator.address),
          identityFor(usersByAddress, creator.address)
        )
      )

      return {
        activity: activityRows.map(toActivityModel),
        calls: callModels,
        creators: creatorModels,
        dataMode: "live",
        summary: {
          activeCalls: callModels.filter((model) => model.status === "active").length,
          bondedPlp: Number(BigInt(summary.bondedPlp)) / 1_000_000_000,
          creatorCount: summary.creatorCount,
          participantCount: summary.participantCount,
        },
      }
    })
    .get("/arena/calls/:id", async ({ params, set }): Promise<ArenaCallDetail | undefined> => {
      const call = await repo.getCall(params.id)
      if (call === null) {
        set.status = 404
        return undefined
      }

      const creatorRow = await repo.getCreator(call.creator)
      // Pull the creator's full call set so win/settled counts are derived over
      // all their calls (the oracle is the source of truth), not just this one.
      const [metaByHash, usersByAddress, overlays, creatorCalls, activityRows] = await Promise.all([
        repo.getMetadataMany([call.creator]),
        repo.usersByAddresses([call.creator]),
        predict.getMarketOverlays([call.predictId]),
        repo.listCallsByCreator(call.creator),
        repo.listActivityForCall(call.callId),
      ])
      const oracleStates = await predict.getOracleStates(creatorCalls.map((entry) => entry.oracleId))
      const creatorStats = deriveCreatorStats(creatorCalls, oracleStates)
      const stats = statsFor(creatorStats, call.creator)
      const identity = identityFor(usersByAddress, call.creator)

      const callModel = toCallModel(
        call,
        stats,
        overlayFor(overlays, call.predictId),
        oracleFor(oracleStates, call.oracleId),
        identity
      )
      const detail: ArenaCallDetail = {
        activity: activityRows.map(toActivityModel),
        call: callModel,
      }
      if (creatorRow !== null) {
        detail.creator = toCreatorModel(
          creatorRow,
          creatorMeta(metaByHash, creatorRow.address),
          stats,
          identity
        )
      }
      return detail
    })
    .get(
      "/arena/creators/:addressOrHandle",
      async ({ params, set }): Promise<ArenaCreatorDetail | undefined> => {
        const creatorRow = await resolveCreator(repo, params.addressOrHandle)
        if (creatorRow === null) {
          set.status = 404
          return undefined
        }

        const calls = await repo.listCallsByCreator(creatorRow.address)
        const [metaByHash, usersByAddress] = await Promise.all([
          repo.getMetadataMany([creatorRow.address]),
          repo.usersByAddresses([creatorRow.address]),
        ])
        const [overlays, oracleStates] = await Promise.all([
          predict.getMarketOverlays(calls.map((call) => call.predictId)),
          predict.getOracleStates(calls.map((call) => call.oracleId)),
        ])
        const creatorStats = deriveCreatorStats(calls, oracleStates)
        const stats = statsFor(creatorStats, creatorRow.address)
        const identity = identityFor(usersByAddress, creatorRow.address)

        return {
          calls: calls.map((call) =>
            toCallModel(
              call,
              stats,
              overlayFor(overlays, call.predictId),
              oracleFor(oracleStates, call.oracleId),
              identity
            )
          ),
          creator: toCreatorModel(
            creatorRow,
            creatorMeta(metaByHash, creatorRow.address),
            stats,
            identity
          ),
        }
      }
    )
    .post("/metadata", async ({ body, session, set }) => {
      requireSession(session)
      const parsed = metadataBodySchema.parse(body)
      const contentType = metadataContentTypeSchema.safeParse(parsed.contentType)
      if (!contentType.success) {
        set.status = 400
        return { error: "unsupported_content_type" }
      }
      const contentJson = canonicalize(parsed.content)
      if (metadataByteLength(contentJson) > MAX_METADATA_BYTES) {
        set.status = 413
        return { error: "metadata_too_large", maxBytes: MAX_METADATA_BYTES }
      }
      const hash = hashContent(parsed.content)
      // V0 integrity check: if a hash is supplied it must match the content hash.
      if (parsed.hash !== undefined && parsed.hash.toLowerCase() !== hash) {
        set.status = 400
        return { error: "hash_mismatch", expected: hash, supplied: parsed.hash.toLowerCase() }
      }
      await repo.storeMetadata(hash, contentJson, contentType.data)
      return { hash }
    })
    .get("/metadata/:hash", async ({ params, set }) => {
      const row = await repo.getMetadata(params.hash.toLowerCase())
      if (row === null) {
        set.status = 404
        return { error: "not_found" }
      }
      return { content: parseJsonOrString(row.contentJson), contentType: row.contentType, hash: row.hash }
    })
}

// Guard for auth-only routes: 401s (via AuthError) when no valid session was
// derived from the Authorization header.
function requireSession(session: BackendSession | null): BackendSession {
  if (session === null) {
    throw new AuthError("missing or invalid session")
  }
  return session
}

function statsFor(stats: Map<string, CreatorStats>, address: string): CreatorStats {
  return stats.get(address) ?? { settledCount: 0, winCount: 0 }
}

// Resolve a creator's identity from the users table (keyed by their wallet
// address). Empty when no linked user exists, so name resolution falls back to
// metadata / short-address as before.
function identityFor(usersByAddress: Map<string, UserRow>, address: string): CreatorIdentity {
  const user = usersByAddress.get(address.toLowerCase())
  if (user === undefined) {
    return {}
  }
  return {
    avatarUrl: user.avatarUrl ?? undefined,
    displayName: user.displayName ?? undefined,
    username: user.username ?? undefined,
  }
}

function creatorMeta(metaByHash: Map<string, { contentJson: string }>, key: string) {
  const row = metaByHash.get(key)
  return row === undefined ? {} : parseArenaMetadata(row.contentJson)
}

function overlayFor(overlays: Map<string, MarketOverlay>, predictId: string): MarketOverlay {
  return overlays.get(predictId) ?? {}
}

function oracleFor(states: Map<string, OracleSettlement>, oracleId: string): OracleSettlement {
  return states.get(oracleId) ?? { settled: false }
}

async function resolveCreator(repo: Repository, idOrAddressOrHandle: string): Promise<ArenaCreatorRow | null> {
  // Chain address: 0x-prefixed.
  if (idOrAddressOrHandle.startsWith("0x")) {
    return repo.getCreator(idOrAddressOrHandle)
  }
  // Our internal ULID (the id surfaced by the API).
  const byId = await repo.getCreatorById(idOrAddressOrHandle)
  if (byId !== null) {
    return byId
  }
  // Handle lookup: match a creator whose metadata handle equals the value.
  const creators = await repo.listCreators()
  const metaByHash = await repo.getMetadataMany(creators.map((creator) => creator.address))
  for (const creator of creators) {
    const meta = creatorMeta(metaByHash, creator.address)
    if (meta.handle === idOrAddressOrHandle) {
      return creator
    }
  }
  return null
}

function parseJsonOrString(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

// Referenced for type alignment with web client interfaces.
export type { ArenaCallDetail, ArenaCreatorDetail }
