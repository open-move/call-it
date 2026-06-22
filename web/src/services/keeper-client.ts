import { z } from "zod"

import { KEEPER_API_URL } from "@/lib/config"

export class KeeperOfflineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "KeeperOfflineError"
  }
}

const countsSchema = z.object({
  positions: z.number(),
  rawEvents: z.number(),
  txs: z.number(),
})

const keeperWalletSchema = z.object({
  address: z.string(),
  belowMinimum: z.boolean(),
  suiBalance: z.string(),
})

const statusSchema = z.object({
  checkpointLag: z.string().nullable(),
  counts: countsSchema,
  dryRun: z.boolean(),
  keeper: keeperWalletSchema.nullable(),
  lastScannedCheckpoint: z.string().nullable(),
  latestCheckpoint: z.string().nullable(),
  minSuiBalance: z.string(),
  redeemableCount: z.number(),
  redeemedCount: z.number(),
  rewardVaultId: z.string().nullable(),
})

const positionSchema = z.object({
  cost: z.string(),
  expiry: z.string(),
  isUp: z.boolean(),
  key: z.string(),
  managerId: z.string(),
  mintedQty: z.string(),
  openQty: z.string(),
  oracleId: z.string(),
  owner: z.string(),
  payout: z.string(),
  redeemedQty: z.string(),
  settled: z.boolean(),
  settlementPrice: z.string().nullable(),
  strike: z.string(),
})

const txSchema = z.object({
  createdAt: z.number(),
  digest: z.string(),
  error: z.string().nullable(),
  expectedPayout: z.string(),
  oracleId: z.string(),
  positionKey: z.string(),
  quantity: z.string(),
  status: z.string(),
})

const reconcileErrorSchema = z.object({
  checkpoint: z.number(),
  error: z.string().nullable(),
  eventType: z.string(),
  id: z.string(),
  transactionDigest: z.string(),
})

const reconcileErrorsSchema = z.array(reconcileErrorSchema)

const positionsPageSchema = z.object({
  rows: z.array(positionSchema),
  total: z.number(),
})
const txsPageSchema = z.object({
  rows: z.array(txSchema),
  total: z.number(),
})

export type KeeperStatus = z.infer<typeof statusSchema>
export type KeeperPosition = z.infer<typeof positionSchema>
export type KeeperTx = z.infer<typeof txSchema>
export type KeeperReconcileError = z.infer<typeof reconcileErrorSchema>

export interface KeeperPage<T> {
  rows: T[]
  total: number
}

export interface KeeperSnapshot {
  reconcileErrors: KeeperReconcileError[]
  status: KeeperStatus
}

async function fetchKeeper<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  if (!KEEPER_API_URL) {
    throw new KeeperOfflineError("KEEPER_API_URL is not configured")
  }

  let response: Response
  try {
    response = await fetch(`${KEEPER_API_URL}${path}`, { cache: "no-store" })
  } catch (error) {
    throw new KeeperOfflineError(error instanceof Error ? error.message : "keeper unreachable")
  }

  if (!response.ok) {
    throw new KeeperOfflineError(`keeper responded ${response.status}`)
  }

  return schema.parse(await response.json())
}

/// Fetch the full read-only snapshot. Returns null when the keeper API is
/// unreachable so the dashboard can render an honest offline state instead of
/// fabricated data.
export async function getKeeperSnapshot(): Promise<KeeperSnapshot | null> {
  try {
    const [status, reconcileErrors] = await Promise.all([
      fetchKeeper("/status", statusSchema),
      fetchKeeper("/reconcile-errors", reconcileErrorsSchema),
    ])
    return { reconcileErrors, status }
  } catch {
    return null
  }
}

function buildPageQuery(params: {
  page: number
  pageSize: number
  status: string
}): string {
  const search = new URLSearchParams({
    limit: String(params.pageSize),
    offset: String(params.page * params.pageSize),
  })
  if (params.status !== "all") {
    search.set("status", params.status)
  }
  return search.toString()
}

export function fetchKeeperPositions(params: {
  page: number
  pageSize: number
  status: string
}): Promise<KeeperPage<KeeperPosition>> {
  return fetchKeeper(`/positions?${buildPageQuery(params)}`, positionsPageSchema)
}

export function fetchKeeperTxs(params: {
  page: number
  pageSize: number
  status: string
}): Promise<KeeperPage<KeeperTx>> {
  return fetchKeeper(`/txs?${buildPageQuery(params)}`, txsPageSchema)
}
