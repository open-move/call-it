import { type MarketSnapshot } from "~/lib/callit/market/types"

export type ShieldPreset = "light" | "balanced" | "tail"

export interface ShieldProduct {
  id: string
  market: MarketSnapshot
  preset: ShieldPreset
  protectionStrikeUsd: number
  distancePercent: number
  distanceUsd: number
  hedgeBudgetBps: number
  status: "active" | "unavailable"
}
