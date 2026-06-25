import { DEPLOYMENT } from "@/lib/deployment"
import { backendFetch } from "@/services/backend-client"
import type { StrategyKey } from "@/services/strategy-transactions"

export type StrategyPerformanceRange = "ALL" | "30D" | "7D"

export interface StrategyPerformancePoint {
  nav: number
  share_price: number
  timestamp_ms: number
  total_shares: number
}

export interface StrategyPerformanceResponse {
  apr: number | null
  apy: number | null
  period_return?: number | null
  points: StrategyPerformancePoint[]
  range: StrategyPerformanceRange
  strategy_id: string
  window_days: number | null
}

export function emptyStrategyPerformance(
  key: StrategyKey,
  range: StrategyPerformanceRange = "ALL"
): StrategyPerformanceResponse {
  return {
    apr: null,
    apy: null,
    points: [],
    range,
    strategy_id: DEPLOYMENT.strategies[key].strategyId,
    window_days: null,
  }
}

export async function getStrategyPerformance(
  key: StrategyKey,
  range: StrategyPerformanceRange = "ALL"
): Promise<StrategyPerformanceResponse | null> {
  const strategyId = DEPLOYMENT.strategies[key].strategyId
  if (!strategyId) {
    return null
  }

  const params = new URLSearchParams({ range })
  return backendFetch<StrategyPerformanceResponse>(
    `/strategies/${encodeURIComponent(strategyId)}/performance?${params.toString()}`
  )
}
