import type { Route } from "./+types/earn"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as EarnPage } from "~/components/earn/page"
import {
  getLpSupplies,
  getLpWithdrawals,
  getPredictVaultPerformance,
  getPredictVaultSummary,
} from "~/lib/deepbook/predict-client"

export async function loader({}: Route.LoaderArgs) {
  const [summary, performance, supplies, withdrawals] = await Promise.all([
    getPredictVaultSummary(),
    getPredictVaultPerformance("ALL"),
    getLpSupplies(10),
    getLpWithdrawals(10),
  ])

  return { performance, supplies, summary, withdrawals }
}

export default function Earn({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <EarnPage
        performance={loaderData.performance}
        supplies={loaderData.supplies}
        summary={loaderData.summary}
        withdrawals={loaderData.withdrawals}
      />
    </AppFrame>
  )
}
