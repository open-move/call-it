import { createFileRoute } from "@tanstack/react-router"
import { AppFrame } from "@/components/app-frame/app-frame"
import { Page as MarketsPage } from "@/components/markets/page"
import { loadActiveMarketSnapshots } from "@/lib/market-loaders"
import { presentTradeMarkets } from "@/lib/trade-presenter"
import {
  buildPredictionActivity,
  INDEX_ACTIVITY_LIMIT,
} from "@/features/index/activity"
import {
  getDirectionalPositionMints,
  getRangeMints,
} from "@/services/predict-client"

export const Route = createFileRoute("/")({
  loader: async () => {
    const [markets, positionMints, rangeMints] = await Promise.all([
      loadActiveMarketSnapshots(),
      getDirectionalPositionMints(INDEX_ACTIVITY_LIMIT),
      getRangeMints(INDEX_ACTIVITY_LIMIT),
    ])
    const { activityByOracleId, predictionActivity } = buildPredictionActivity(
      positionMints,
      rangeMints
    )

    return {
      markets: await presentTradeMarkets(markets, activityByOracleId),
      predictionActivity,
    }
  },
  component: Home,
})

function Home() {
  const { markets, predictionActivity } = Route.useLoaderData()

  return (
    <AppFrame>
      <MarketsPage markets={markets} predictionActivity={predictionActivity} />
    </AppFrame>
  )
}
