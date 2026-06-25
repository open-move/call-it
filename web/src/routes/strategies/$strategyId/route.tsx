import { createFileRoute, redirect } from "@tanstack/react-router"

import { StrategyDetail } from "@/components/strategies/strategy-detail"
import { getStrategyMeta, isStrategyKey } from "@/lib/strategies/registry"
import { emptyStrategyPerformance, getStrategyPerformance } from "@/services/strategy-performance-client"
import { getStrategyState } from "@/services/strategy-client"

export const Route = createFileRoute("/strategies/$strategyId")({
  loader: async ({ params }) => {
    const key = params.strategyId
    if (!isStrategyKey(key)) {
      throw redirect({ to: "/strategies" })
    }
    const [state, performance] = await Promise.all([
      getStrategyState(key),
      getStrategyPerformance(key, "ALL").catch(() => null),
    ])
    return { key, performance: performance ?? emptyStrategyPerformance(key), state }
  },
  component: StrategyDetailRoute,
})

function StrategyDetailRoute() {
  const { key, performance, state } = Route.useLoaderData()
  return <StrategyDetail meta={getStrategyMeta(key)} performance={performance} state={state} />
}
