import { createFileRoute } from "@tanstack/react-router"
import { EarnSkeleton } from "@/components/shared/pending-skeleton"
import { Page as EarnPage } from "@/components/earn/page"
import {
  getLpSupplies,
  getLpWithdrawals,
  getPredictVaultPerformance,
  getPredictVaultSummary,
} from "@/services/predict-client"

export const Route = createFileRoute("/earn")({
  pendingComponent: EarnSkeleton,
  loader: async () => {
    const [summary, performance, supplies, withdrawals] = await Promise.all([
      getPredictVaultSummary(),
      getPredictVaultPerformance("ALL"),
      getLpSupplies(100),
      getLpWithdrawals(100),
    ])

    return { performance, supplies, summary, withdrawals }
  },
  component: Earn,
})

function Earn() {
  const { performance, supplies, summary, withdrawals } = Route.useLoaderData()

  return (
    <EarnPage
      performance={performance}
      supplies={supplies}
      summary={summary}
      withdrawals={withdrawals}
    />
  )
}
