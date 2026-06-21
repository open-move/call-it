import { createFileRoute, redirect } from "@tanstack/react-router"

import { StrategyDetail } from "@/components/strategies/strategy-detail"
import { getStrategyMeta, isStrategyKey } from "@/lib/strategies/registry"
import { getStrategyState } from "@/services/strategy-client"

export const Route = createFileRoute("/strategies/$strategyId")({
  loader: async ({ params }) => {
    const key = params.strategyId
    if (!isStrategyKey(key)) {
      throw redirect({ to: "/strategies" })
    }
    const state = await getStrategyState(key)
    return { key, state }
  },
  component: StrategyDetailRoute,
})

function StrategyDetailRoute() {
  const { key, state } = Route.useLoaderData()
  return <StrategyDetail meta={getStrategyMeta(key)} state={state} />
}
