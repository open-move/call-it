import { useEffect, useState } from "react"

import { StatusTone } from "@/components/primitives/status-indicator"
import { QUOTE_SCALE } from "@/lib/config"
import { getDisplayChartPoints } from "@/lib/earn/chart"
import { annualizedReturn } from "@/lib/perf/annualize"
import type { AnnualizedReturn } from "@/lib/perf/annualize"
import { getStrategyStatus } from "@/lib/strategies/format"
import { STRATEGY_ORDER } from "@/lib/strategies/registry"
import { getPredictVaultPerformance, getPredictVaultSummary } from "@/services/predict-client"
import { getStrategyPerformance } from "@/services/strategy-performance-client"
import { getStrategyState } from "@/services/strategy-client"
import type { StrategyKey } from "@/services/strategy-transactions"

/** Card identity on the landing surface: the PLP Earn vault plus each strategy. */
export type StrategyStatsKey = "earn" | StrategyKey

export interface StrategyStat {
  // null = computed but no data; undefined = not loaded yet.
  apyMetric?: AnnualizedReturn | null
  navUsd?: number
  sharePrice?: number
  status?: string
}

export type StrategyStats = Partial<Record<StrategyStatsKey, StrategyStat>>

/** Single source of truth for status -> indicator tone across strategy UI. */
export function getStrategyStatusTone(status?: string): StatusTone {
  switch (status) {
    // "Open" — instant deposits/withdrawals; "Live" — the earn (PLP) vault.
    case "Open":
    case "Live":
      return StatusTone.Live
    // "In round" — deployed and working; deposits/withdrawals queue.
    case "In round":
      return StatusTone.Neutral
    case "Paused":
      return StatusTone.Simulated
    default:
      return StatusTone.Neutral
  }
}

/**
 * Lazily reads live stats for each strategy on the client. Cards render
 * immediately and fill in once resolved; any fetch failure falls back to
 * `undefined` rather than surfacing an error on a navigation surface.
 */
export function useStrategyStats() {
  const [stats, setStats] = useState<StrategyStats>()

  useEffect(() => {
    let active = true

    async function load() {
      const [earn, earnPerformance, ...vaultResults] = await Promise.all([
        getPredictVaultSummary().catch(() => undefined),
        getPredictVaultPerformance("ALL").catch(() => undefined),
        ...STRATEGY_ORDER.map(async (key) =>
          Promise.all([
            getStrategyState(key).catch(() => undefined),
            getStrategyPerformance(key, "ALL").catch(() => null),
          ]).then(([state, performance]) => ({ key, performance, state }))
        ),
      ])

      if (!active) {
        return
      }

      const earnAnnualized = earnPerformance
        ? annualizedReturn(getDisplayChartPoints(earnPerformance.points).points)
        : null

      const next: StrategyStats = {
        earn: {
          apyMetric: earnPerformance ? earnAnnualized : undefined,
          navUsd: earn ? earn.vault_value / QUOTE_SCALE : undefined,
          sharePrice: earn?.plp_share_price,
          status: earn ? "Live" : undefined,
        },
      }

      vaultResults.forEach(({ key, performance, state }) => {
        const displayPoints = performance ? getDisplayChartPoints(performance.points).points : []
        const annualized = performance ? annualizedReturn(displayPoints) : null

        next[key] = {
          apyMetric: performance ? annualized : undefined,
          navUsd: state ? Number(state.nav) / QUOTE_SCALE : undefined,
          sharePrice: state?.sharePrice,
          status: state ? getStrategyStatus(state) : undefined,
        }
      })

      setStats(next)
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  return stats
}
