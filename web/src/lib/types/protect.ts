import type { MarketSnapshot } from "@/lib/types/market"

export type ProtectDirection = "down"
export type ProtectPreset = "near" | "balanced" | "tail"

export interface ProtectProduct {
  direction: ProtectDirection
  distancePercent: number
  id: string
  market: MarketSnapshot
  preset: ProtectPreset
  status: "preview"
  triggerStrikeUsd: number
}
