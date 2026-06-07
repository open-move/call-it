import { createFileRoute } from "@tanstack/react-router"

import { AppFrame } from "@/components/app-frame/app-frame"
import { Page as EarnPage } from "@/components/earn/page"
import {
  getLpSupplies,
  getLpWithdrawals,
  getPredictVaultPerformance,
  getPredictVaultSummary,
} from "@/services/predict-client"

export const Route = createFileRoute("/earn")({
  loader: async () => {
    const [summary, performance, supplies, withdrawals] = await Promise.all([
      getPredictVaultSummary(),
      getPredictVaultPerformance("ALL"),
      getLpSupplies(10),
      getLpWithdrawals(10),
    ])

    return { performance, supplies, summary, withdrawals }
  },
  component: Earn,
})

function Earn() {
  const { performance, supplies, summary, withdrawals } = Route.useLoaderData()

  return (
    <AppFrame>
      <EarnPage
        performance={performance}
        supplies={supplies}
        summary={summary}
        withdrawals={withdrawals}
      />
    </AppFrame>
  )
}
