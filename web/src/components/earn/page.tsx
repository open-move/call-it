import { getActivity } from "@/lib/earn/activity"
import type {
  LpSupplyEvent,
  LpWithdrawalEvent,
  VaultPerformanceResponse,
  VaultSummary,
} from "@/lib/types/predict"
import { ActivityCard } from "./activity-card"
import { LiquidityPanel } from "./liquidity-panel"
import { VaultStatsCard } from "./vault-stats-card"

export interface PageProps {
  performance: VaultPerformanceResponse
  supplies: LpSupplyEvent[]
  summary: VaultSummary
  withdrawals: LpWithdrawalEvent[]
}

export function Page({
  performance,
  supplies,
  summary,
  withdrawals,
}: PageProps) {
  const activity = getActivity(supplies, withdrawals)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="mx-auto grid max-w-5xl items-stretch gap-3 lg:grid-cols-2">
          <VaultStatsCard performance={performance} summary={summary} />

          <aside className="min-w-0">
            <LiquidityPanel summary={summary} />
          </aside>
        </div>

        <div className="mx-auto max-w-5xl">
          <ActivityCard activity={activity} />
        </div>
      </section>
    </main>
  )
}
