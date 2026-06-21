import { useEffect, useState } from "react"

import { StatusTone } from "@/components/primitives/status-indicator"
import { QUOTE_SCALE } from "@/lib/config"
import { getStrategyStatus } from "@/lib/strategies/format"
import { STRATEGY_ORDER } from "@/lib/strategies/registry"
import { getPredictVaultSummary } from "@/services/predict-client"
import { getStrategyState } from "@/services/strategy-client"
import type { StrategyKey } from "@/services/strategy-transactions"

/** Card identity on the landing surface: the PLP Earn vault plus each strategy. */
export type StrategyStatsKey = "earn" | StrategyKey

export interface StrategyStat {
  navUsd?: number
  sharePrice?: number
  status?: string
}

export type StrategyStats = Partial<Record<StrategyStatsKey, StrategyStat>>

/** Single source of truth for status -> indicator tone across strategy UI. */
export function getStrategyStatusTone(status?: string): StatusTone {
  switch (status) {
    case "Open":
    case "Live":
    case "Round active":
    case "Between rounds":
      return StatusTone.Live
    case "Oracle settled":
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
      const [earn, ...vaultStates] = await Promise.all([
        getPredictVaultSummary().catch(() => undefined),
        ...STRATEGY_ORDER.map((key) =>
          getStrategyState(key).catch(() => undefined)
        ),
      ])

      if (!active) {
        return
      }

      const next: StrategyStats = {
        earn: {
          navUsd: earn ? earn.vault_value / QUOTE_SCALE : undefined,
          sharePrice: earn?.plp_share_price,
          status: earn ? "Live" : undefined,
        },
      }

      STRATEGY_ORDER.forEach((key, index) => {
        const state = vaultStates[index]

        next[key] = {
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
