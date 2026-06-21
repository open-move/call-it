import { z } from "zod"

import type { Config } from "../config.ts"
import type { MarketOverlay, OracleSettlement } from "./leaderboard.ts"
import { logger } from "../logger.ts"

// The backend COMPOSES the Predict server for market/chance data rather than
// indexing Predict events locally. This client fetches per-market overlays used
// to enrich arena calls (label, strike, fair-up probability).
//
// The exact Predict server response schema is treated as an external boundary:
// we validate loosely and degrade gracefully (empty overlay) on any mismatch or
// network error, so arena reads never hard-fail on Predict availability.

const marketResponseSchema = z
  .object({
    fairUpProbability: z.number().optional(),
    label: z.string().optional(),
    strikeUsd: z.number().optional(),
  })
  .partial()

// Predict server GET /oracles/:oracle_id/state → { oracle: { status, expiry,
// settlement_price, settled_at, ... }, ... }. status is "created" | "active" |
// "settled". Validated loosely as an external boundary.
const oracleStateResponseSchema = z
  .object({
    oracle: z
      .object({
        expiry: z.number().nullish(),
        settlement_price: z.number().nullish(),
        settled_at: z.number().nullish(),
        status: z.string().optional(),
        underlying_asset: z.string().nullish(),
      })
      .partial()
      .optional(),
  })
  .partial()

export class PredictServerClient {
  constructor(private readonly config: Config) {}

  async getMarketOverlay(predictId: string): Promise<MarketOverlay> {
    try {
      const url = `${this.config.predictServerUrl}/markets/${encodeURIComponent(predictId)}`
      const response = await fetch(url, { headers: { accept: "application/json" } })
      if (!response.ok) {
        return {}
      }
      const json: unknown = await response.json()
      const parsed = marketResponseSchema.safeParse(json)
      if (!parsed.success) {
        return {}
      }
      const overlay: MarketOverlay = {}
      if (parsed.data.fairUpProbability !== undefined) {
        overlay.fairUpProbability = parsed.data.fairUpProbability
      }
      if (parsed.data.label !== undefined) {
        overlay.label = parsed.data.label
      }
      if (parsed.data.strikeUsd !== undefined) {
        overlay.strikeUsd = parsed.data.strikeUsd
      }
      return overlay
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), predictId },
        "predict server overlay fetch failed"
      )
      return {}
    }
  }

  async getMarketOverlays(predictIds: string[]): Promise<Map<string, MarketOverlay>> {
    const result = new Map<string, MarketOverlay>()
    const unique = [...new Set(predictIds)]
    const overlays = await Promise.all(unique.map((id) => this.getMarketOverlay(id)))
    unique.forEach((id, index) => {
      const overlay = overlays[index]
      if (overlay !== undefined) {
        result.set(id, overlay)
      }
    })
    return result
  }

  // Composes the oracle's settlement state so callers can tell that an oracle
  // has resolved before the Call is settled on-chain. Degrades to not-settled
  // on any error so arena reads never hard-fail on Predict availability.
  async getOracleState(oracleId: string): Promise<OracleSettlement> {
    try {
      const url = `${this.config.predictServerUrl}/oracles/${encodeURIComponent(oracleId)}/state`
      const response = await fetch(url, { headers: { accept: "application/json" } })
      if (!response.ok) {
        return { settled: false }
      }
      const json: unknown = await response.json()
      const parsed = oracleStateResponseSchema.safeParse(json)
      if (!parsed.success) {
        return { settled: false }
      }
      const oracle = parsed.data.oracle
      const settlement: OracleSettlement = { settled: oracle?.status === "settled" }
      if (oracle?.underlying_asset !== undefined && oracle.underlying_asset !== null) {
        settlement.asset = oracle.underlying_asset
      }
      if (oracle?.expiry !== undefined && oracle.expiry !== null) {
        settlement.expiryMs = oracle.expiry
      }
      if (oracle?.settlement_price !== undefined && oracle.settlement_price !== null) {
        settlement.settlementPrice = String(oracle.settlement_price)
      }
      return settlement
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), oracleId },
        "predict server oracle state fetch failed"
      )
      return { settled: false }
    }
  }

  async getOracleStates(oracleIds: string[]): Promise<Map<string, OracleSettlement>> {
    const result = new Map<string, OracleSettlement>()
    const unique = [...new Set(oracleIds)]
    const states = await Promise.all(unique.map((id) => this.getOracleState(id)))
    unique.forEach((id, index) => {
      const state = states[index]
      if (state !== undefined) {
        result.set(id, state)
      }
    })
    return result
  }
}
