import { useState } from "react"

import type {
  LeaderboardPeriod,
  LeaderboardPeriodModels,
} from "@/lib/leaderboard/types"
import { LeaderboardHeader } from "./header"
import { LeaderboardSummary } from "./summary-card"
import { AccountRankings } from "./rankings-table"

export interface LeaderboardPageProps {
  models: LeaderboardPeriodModels
}

export function Page({ models }: LeaderboardPageProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("allTime")
  const model = models[period]

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <LeaderboardHeader
          model={model}
          onPeriodChange={setPeriod}
          period={period}
        />
        <LeaderboardSummary model={model} />
        <AccountRankings rows={model.rows} />
      </section>
    </main>
  )
}
