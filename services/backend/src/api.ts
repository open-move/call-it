import { Elysia } from "elysia"
import { z, ZodError } from "zod"

import type { Config } from "./config.ts"
import type { Repository } from "./db/repo.ts"
import type { ArenaCreatorRow } from "./db/schema.ts"
import { PredictServerClient } from "./domains/predict-server.ts"
import { parseArenaMetadata } from "./domains/metadata.ts"
import { hashContent } from "./domains/metadata.ts"
import type {
  ArenaActivityModel,
  ArenaCallModel,
  ArenaCreatorModel,
  ArenaPageModel,
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
  content: z.unknown(),
  contentType: z.string().min(1),
  hash: z.string().min(1).optional(),
})

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
    .onError(({ code, error, set }) => {
      if (code === "NOT_FOUND") {
        set.status = 404
        return { error: "not_found" }
      }
      if (error instanceof ZodError) {
        set.status = 400
        return { error: "invalid_request" }
      }
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "api request failed"
      )
      set.status = 500
      return { error: error instanceof Error ? error.message : "internal_error" }
    })
    .get("/health", () => ({ ok: true }))
    .get("/arena", async (): Promise<ArenaPageModel> => {
      const [calls, creators, activityRows, summary] = await Promise.all([
        repo.listCalls(),
        repo.listCreators(),
        repo.listActivity(ACTIVITY_LIMIT),
        repo.summary(),
      ])

      const metaByHash = await repo.getMetadataMany([
        ...creators.map((creator) => creator.address),
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
          oracleFor(oracleStates, call.oracleId)
        )
      )
      const creatorModels = creators.map((creator) =>
        toCreatorModel(creator, creatorMeta(metaByHash, creator.address), statsFor(creatorStats, creator.address))
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
      const [metaByHash, overlays, creatorCalls, activityRows] = await Promise.all([
        repo.getMetadataMany([call.creator]),
        predict.getMarketOverlays([call.predictId]),
        repo.listCallsByCreator(call.creator),
        repo.listActivityForCall(call.callId),
      ])
      const oracleStates = await predict.getOracleStates(creatorCalls.map((entry) => entry.oracleId))
      const creatorStats = deriveCreatorStats(creatorCalls, oracleStates)
      const stats = statsFor(creatorStats, call.creator)

      const callModel = toCallModel(
        call,
        stats,
        overlayFor(overlays, call.predictId),
        oracleFor(oracleStates, call.oracleId)
      )
      const detail: ArenaCallDetail = {
        activity: activityRows.map(toActivityModel),
        call: callModel,
      }
      if (creatorRow !== null) {
        detail.creator = toCreatorModel(creatorRow, creatorMeta(metaByHash, creatorRow.address), stats)
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
        const metaByHash = await repo.getMetadataMany([creatorRow.address])
        const [overlays, oracleStates] = await Promise.all([
          predict.getMarketOverlays(calls.map((call) => call.predictId)),
          predict.getOracleStates(calls.map((call) => call.oracleId)),
        ])
        const creatorStats = deriveCreatorStats(calls, oracleStates)
        const stats = statsFor(creatorStats, creatorRow.address)

        return {
          calls: calls.map((call) =>
            toCallModel(
              call,
              stats,
              overlayFor(overlays, call.predictId),
              oracleFor(oracleStates, call.oracleId)
            )
          ),
          creator: toCreatorModel(creatorRow, creatorMeta(metaByHash, creatorRow.address), stats),
        }
      }
    )
    .post("/metadata", async ({ body, set }) => {
      const parsed = metadataBodySchema.parse(body)
      const hash = hashContent(parsed.content)
      // V0 integrity check: if a hash is supplied it must match the content hash.
      // TODO(V1): require a wallet signature over the content/hash before storing.
      if (parsed.hash !== undefined && parsed.hash.toLowerCase() !== hash) {
        set.status = 400
        return { error: "hash_mismatch", expected: hash, supplied: parsed.hash.toLowerCase() }
      }
      const contentJson = typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content)
      await repo.storeMetadata(hash, contentJson, parsed.contentType)
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

function statsFor(stats: Map<string, CreatorStats>, address: string): CreatorStats {
  return stats.get(address) ?? { settledCount: 0, winCount: 0 }
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
