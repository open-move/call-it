import type { AllocationTone } from "@/components/primitives/allocation-bar"
import type { StrategyKey } from "@/services/strategy-transactions"
import type { StrategyShape } from "./types"

export interface AllocationSegmentDef {
  field: string
  label: string
  tone: AllocationTone
}

export interface PolicyFieldDef {
  field: string
  label: string
  kind?: "bps" | "count"
}

export interface StrategyMeta {
  /** Lowercase kebab-case identifier; also the URL segment (`/strategies/<key>`). */
  key: StrategyKey
  name: string
  tagline: string
  shareSymbol: string
  shape: StrategyShape
  hasPlp: boolean
  /** Capital allocation segments derived from policy bps fields (relative weights). */
  allocation: AllocationSegmentDef[]
  /** Policy parameters to surface in the detail policy panel. */
  policyFields: PolicyFieldDef[]
}

/** Display order on the registry surface. */
export const STRATEGY_ORDER: StrategyKey[] = [
  "hedged-plp",
  "plp-collar",
  "strangle",
  "bullish-upside",
  "range-ladder",
]

export const STRATEGIES: Record<StrategyKey, StrategyMeta> = {
  "hedged-plp": {
    key: "hedged-plp",
    name: "Tail-Hedge PLP",
    tagline: "Provide Predict liquidity with a downside hedge: PLP yield minus crash insurance.",
    shareSymbol: "hPLP",
    shape: "single",
    hasPlp: true,
    allocation: [
      { field: "max_plp_allocation_bps", label: "PLP", tone: "primary" },
      { field: "hedge_budget_bps", label: "Hedge", tone: "down" },
      { field: "reserve_bps", label: "Reserve", tone: "muted" },
    ],
    policyFields: [
      { field: "hedge_budget_bps", label: "Hedge budget" },
      { field: "strike_band_bps", label: "Strike band" },
      { field: "max_plp_allocation_bps", label: "Max PLP" },
      { field: "reserve_bps", label: "Reserve" },
      { field: "max_hedge_ask_bps", label: "Max hedge ask" },
    ],
  },
  "plp-collar": {
    key: "plp-collar",
    name: "PLP Collar",
    tagline: "Provide liquidity inside a collar: buy downside, sell upside, keep the middle.",
    shareSymbol: "PCOLLAR",
    shape: "dual",
    hasPlp: true,
    allocation: [
      { field: "max_plp_allocation_bps", label: "PLP", tone: "primary" },
      { field: "downside_budget_bps", label: "Downside", tone: "down" },
      { field: "upside_budget_bps", label: "Upside", tone: "up" },
      { field: "reserve_bps", label: "Reserve", tone: "muted" },
    ],
    policyFields: [
      { field: "downside_budget_bps", label: "Downside budget" },
      { field: "upside_budget_bps", label: "Upside budget" },
      { field: "strike_band_bps", label: "Strike band" },
      { field: "max_plp_allocation_bps", label: "Max PLP" },
      { field: "reserve_bps", label: "Reserve" },
      { field: "max_leg_ask_bps", label: "Max leg ask" },
    ],
  },
  strangle: {
    key: "strangle",
    name: "Short Strangle",
    tagline: "Sell both tails: collect premium when price stays in the middle.",
    shareSymbol: "STRANGLE",
    shape: "dual",
    hasPlp: false,
    allocation: [
      { field: "premium_budget_bps", label: "Premium", tone: "primary" },
      { field: "reserve_bps", label: "Reserve", tone: "muted" },
    ],
    policyFields: [
      { field: "premium_budget_bps", label: "Premium budget" },
      { field: "strike_band_bps", label: "Strike band" },
      { field: "reserve_bps", label: "Reserve" },
      { field: "max_leg_ask_bps", label: "Max leg ask" },
    ],
  },
  "bullish-upside": {
    key: "bullish-upside",
    name: "Bullish Upside",
    tagline: "Sell the upside binary: earn premium on a capped bullish view.",
    shareSymbol: "BUP",
    shape: "single",
    hasPlp: false,
    allocation: [
      { field: "premium_budget_bps", label: "Premium", tone: "primary" },
      { field: "reserve_bps", label: "Reserve", tone: "muted" },
    ],
    policyFields: [
      { field: "premium_budget_bps", label: "Premium budget" },
      { field: "strike_band_bps", label: "Strike band" },
      { field: "reserve_bps", label: "Reserve" },
      { field: "max_up_ask_bps", label: "Max up ask" },
    ],
  },
  "range-ladder": {
    key: "range-ladder",
    name: "Range Ladder",
    tagline: "A ladder of range positions around spot: premium from staying in range.",
    shareSymbol: "RLADDER",
    shape: "ladder",
    hasPlp: false,
    allocation: [
      { field: "premium_budget_bps", label: "Premium", tone: "primary" },
      { field: "reserve_bps", label: "Reserve", tone: "muted" },
    ],
    policyFields: [
      { field: "premium_budget_bps", label: "Premium budget" },
      { field: "reserve_bps", label: "Reserve" },
      { field: "max_range_ask_bps", label: "Max range ask" },
      { field: "max_rung_count", kind: "count", label: "Max rungs" },
    ],
  },
}

export function getStrategyMeta(key: StrategyKey): StrategyMeta {
  return STRATEGIES[key]
}

export function isStrategyKey(value: string): value is StrategyKey {
  return value in STRATEGIES
}
