import { createHash } from "node:crypto"
import { z } from "zod"

// Off-chain metadata: small content-addressed payloads. The Arena contract
// stores `metadata_hash` on chain; the backend stores the resolvable content.

export const MAX_METADATA_BYTES = 4096

export const metadataContentTypeSchema = z.enum(["application/json", "text/plain"])

export interface ArenaMetadataContent {
  avatarSeed?: string | undefined
  handle?: string | undefined
  name?: string | undefined
}

// Content is open-ended JSON, but known arena fields are surfaced for the API.
export const metadataContentSchema = z
  .object({
    avatarSeed: z.string().max(80).optional(),
    handle: z.string().max(64).optional(),
    name: z.string().max(120).optional(),
  })
  .passthrough()

export const metadataWriteContentSchema = z.union([metadataContentSchema, z.string()])

export type MetadataWriteContent = z.infer<typeof metadataWriteContentSchema>

export interface StoreMetadataInput {
  content: unknown
  contentType: string
  expectedHash?: string
}

export interface StoredMetadata {
  content: unknown
  contentType: string
  hash: string
}

// Canonical string form used for hashing and storage. Strings hash as-is;
// everything else is JSON-stringified deterministically by key order.
export function canonicalize(content: unknown): string {
  if (typeof content === "string") {
    return content
  }
  return JSON.stringify(content, sortedReplacer)
}

export function hashContent(content: unknown): string {
  return createHash("sha256").update(canonicalize(content), "utf8").digest("hex")
}

export function metadataByteLength(contentJson: string): number {
  return Buffer.byteLength(contentJson, "utf8")
}

export function parseArenaMetadata(contentJson: string): ArenaMetadataContent {
  let parsed: unknown
  try {
    parsed = JSON.parse(contentJson)
  } catch {
    return {}
  }
  const result = metadataContentSchema.safeParse(parsed)
  return result.success ? result.data : {}
}

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      sorted[key] = record[key]
    }
    return sorted
  }
  return value
}
