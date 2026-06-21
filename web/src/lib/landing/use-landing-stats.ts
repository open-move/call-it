import { QUOTE_SCALE } from "@/lib/config"
import { getPredictOracles, getPredictVaultSummary } from "@/services/predict-client"

export interface LandingStats {
  /** PLP vault value, in DUSDC. */
  vaultValue: number
  /** Total maximum payout across open positions, in DUSDC. */
  maxPayout: number
  /** Currently withdrawable liquidity, in DUSDC. */
  withdrawable: number
  /** Count of active prediction markets. */
  activeMarkets: number
}

export type LandingStatsResult =
  | { status: "ready"; stats: LandingStats }
  | { status: "error" }

const compactDusdcFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
})

export function formatCompactDusdc(value: number) {
  return compactDusdcFormatter.format(value)
}

/**
 * Loads the public, wallet-free Predict reads behind the landing stats band.
 * Called from the route loader so the numbers are in the server-rendered HTML
 * (no client-side fetch/skeleton). Returns "error" instead of throwing, so a
 * slow/unavailable testnet RPC degrades to an em dash rather than breaking SSR.
 */
export async function loadLandingStats(): Promise<LandingStatsResult> {
  const [summaryResult, oraclesResult] = await Promise.allSettled([
    getPredictVaultSummary(),
    getPredictOracles(),
  ])

  if (summaryResult.status !== "fulfilled") {
    return { status: "error" }
  }

  const summary = summaryResult.value
  const activeMarkets =
    oraclesResult.status === "fulfilled"
      ? oraclesResult.value.filter((oracle) => oracle.status === "active").length
      : 0

  return {
    status: "ready",
    stats: {
      activeMarkets,
      maxPayout: summary.total_max_payout / QUOTE_SCALE,
      vaultValue: summary.vault_value / QUOTE_SCALE,
      withdrawable: summary.available_withdrawal / QUOTE_SCALE,
    },
  }
}
