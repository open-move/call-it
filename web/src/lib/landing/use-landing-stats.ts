import { useEffect, useState } from "react"

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

export type LandingStatsState =
  | { status: "loading" }
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
 * Fetches the public, wallet-free Predict reads that back the landing stats
 * band. Runs client-side so the landing paints instantly and never blocks on a
 * slow testnet RPC; on failure the band falls back to an em dash rather than
 * fabricated numbers.
 */
export function useLandingStats(): LandingStatsState {
  const [state, setState] = useState<LandingStatsState>({ status: "loading" })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [summaryResult, oraclesResult] = await Promise.allSettled([
        getPredictVaultSummary(),
        getPredictOracles(),
      ])

      if (cancelled) {
        return
      }

      if (summaryResult.status !== "fulfilled") {
        setState({ status: "error" })
        return
      }

      const summary = summaryResult.value
      const activeMarkets =
        oraclesResult.status === "fulfilled"
          ? oraclesResult.value.filter((oracle) => oracle.status === "active")
              .length
          : 0

      setState({
        status: "ready",
        stats: {
          activeMarkets,
          maxPayout: summary.total_max_payout / QUOTE_SCALE,
          vaultValue: summary.vault_value / QUOTE_SCALE,
          withdrawable: summary.available_withdrawal / QUOTE_SCALE,
        },
      })
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
