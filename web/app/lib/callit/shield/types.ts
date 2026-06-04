import { type MarketSnapshot } from "~/lib/callit/market/types"

export type ShieldPreset = "light" | "balanced" | "tail"
export type ShieldTenor = "standard" | "weekly"

export interface ShieldProduct {
  id: string
  market: MarketSnapshot
  preset: ShieldPreset
  protectionStrikeUsd: number
  distancePercent: number
  distanceUsd: number
  hedgeBudgetBps: number
  tenor: ShieldTenor
  status: "active" | "unavailable"
}
