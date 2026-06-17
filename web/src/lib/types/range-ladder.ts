import type { MarketSnapshot } from "@/lib/types/market"

export type RangeLadderPreset = "tight" | "balanced" | "wide"

export interface RangeLadderRungPreview {
  costTier: "low" | "mid" | "high"
  higherStrikeUsd: number
  lowerStrikeUsd: number
  weight: string
}

export interface RangeLadderProduct {
  distancePercent: number
  id: string
  market: MarketSnapshot
  preset: RangeLadderPreset
  rungs: RangeLadderRungPreview[]
  status: "preview"
}
