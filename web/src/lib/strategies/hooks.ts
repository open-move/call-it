import { useEffect, useState } from "react"

import type {
  AllocationSegment,
  AllocationTone,
} from "@/components/primitives/allocation-bar"
import { StatusTone } from "@/components/primitives/status-indicator"
import { QUOTE_SCALE } from "@/lib/config"
import { getVaultStatus as getRangeLadderStatus } from "@/lib/range-ladder/helpers"
import { getVaultStatus as getShieldStatus } from "@/lib/shield/helpers"
import { getPredictVaultSummary } from "@/services/predict-client"
import { getRangeLadderStrategyState } from "@/services/range-ladder-client"
import { getHedgedPlpStrategyState } from "@/services/shield-client"

export type StrategyKey = "earn" | "shield" | "rangeLadder"

export interface StrategyStat {
  navUsd?: number
  sharePrice?: number
  segments?: AllocationSegment[]
  status?: string
}

export type StrategyStats = Record<StrategyKey, StrategyStat>

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

function normalize(parts: { label: string; weight: number; tone: AllocationTone }[]) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.weight), 0)

  if (total <= 0) {
    return undefined
  }

  return parts.map((part) => ({
    label: part.label,
    pct: Math.max(0, part.weight) / total,
    tone: part.tone,
  }))
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
      const [earn, shield, range] = await Promise.all([
        getPredictVaultSummary().catch(() => undefined),
        getHedgedPlpStrategyState().catch(() => undefined),
        getRangeLadderStrategyState().catch(() => undefined),
      ])

      if (!active) {
        return
      }

      setStats({
        earn: {
          navUsd: earn ? earn.vault_value / QUOTE_SCALE : undefined,
          sharePrice: earn?.plp_share_price,
          segments: earn
            ? normalize([
                { label: "Deployed", weight: earn.utilization, tone: "primary" },
                {
                  label: "Available",
                  weight: 1 - earn.utilization,
                  tone: "muted",
                },
              ])
            : undefined,
          status: earn ? "Live" : undefined,
        },
        shield: {
          navUsd: shield ? Number(shield.nav) / QUOTE_SCALE : undefined,
          sharePrice: shield?.sharePrice,
          segments: shield
            ? normalize([
                {
                  label: "PLP",
                  weight: shield.policy.maxPlpAllocationBps,
                  tone: "primary",
                },
                {
                  label: "Hedge",
                  weight: shield.policy.hedgeBudgetBps,
                  tone: "down",
                },
                {
                  label: "Reserve",
                  weight: shield.policy.reserveBps,
                  tone: "muted",
                },
              ])
            : undefined,
          status: shield ? getShieldStatus(shield) : undefined,
        },
        rangeLadder: {
          navUsd: range ? Number(range.nav) / QUOTE_SCALE : undefined,
          sharePrice: range?.sharePrice,
          segments: range
            ? normalize([
                {
                  label: "Premium",
                  weight: range.policy.premiumBudgetBps,
                  tone: "primary",
                },
                {
                  label: "Reserve",
                  weight: range.policy.reserveBps,
                  tone: "muted",
                },
              ])
            : undefined,
          status: range ? getRangeLadderStatus(range) : undefined,
        },
      })
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  return stats
}
