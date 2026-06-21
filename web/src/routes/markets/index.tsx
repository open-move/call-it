import { createFileRoute } from "@tanstack/react-router"
import { MarketsSkeleton } from "@/components/shared/pending-skeleton"
import { Page as MarketsPage } from "@/components/markets/page"
import {
  buildPredictionActivity,
  INDEX_ACTIVITY_LIMIT,
} from "@/features/index/activity"
import {
  loadActiveMarketSnapshots,
  loadExpiredMarketSnapshots,
} from "@/lib/market-loaders"
import { presentTradeMarkets } from "@/lib/trade-presenter"
import {
  getDirectionalPositionMints,
  getRangeMints,
} from "@/services/predict-client"

export const Route = createFileRoute("/markets/")({
  pendingComponent: MarketsSkeleton,
  loader: async () => {
    const [markets, positionMints, rangeMints, expiredMarkets] =
      await Promise.all([
        loadActiveMarketSnapshots(),
        getDirectionalPositionMints(INDEX_ACTIVITY_LIMIT),
        getRangeMints(INDEX_ACTIVITY_LIMIT),
        loadExpiredMarketSnapshots(),
      ])
    const { activityByOracleId, predictionActivity } = buildPredictionActivity(
      positionMints,
      rangeMints
    )

    return {
      markets: await presentTradeMarkets(markets, activityByOracleId),
      expiredMarkets: await presentTradeMarkets(expiredMarkets, activityByOracleId),
      predictionActivity,
    }
  },
  component: Markets,
})

function Markets() {
  const { markets, expiredMarkets, predictionActivity } = Route.useLoaderData()
  return (
    <MarketsPage
      expiredMarkets={expiredMarkets}
      markets={markets}
      predictionActivity={predictionActivity}
    />
  )
}
