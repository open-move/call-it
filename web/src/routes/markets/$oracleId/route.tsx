import { createFileRoute, notFound } from "@tanstack/react-router"
import { MarketDetailSkeleton } from "@/components/shared/pending-skeleton"

import { Page as MarketDetailPage } from "@/components/market-detail/page"
import { loadMarketSnapshot } from "@/lib/market-loaders"
import {
  filterRangeRedemptions,
  filterRangeTrades,
  filterRedemptions,
} from "@/lib/trade-activity"
import { getDefaultTradeStrike } from "@/lib/trade-strikes"
import { filterTrades } from "@/lib/trade-trades"
import {
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
  getRangeMints,
  getRangeRedeems,
} from "@/services/predict-client"
import { marketSearchSchema, getInitialSide } from "@/features/market-detail/search"
import {
  loadExpiryOptions,
  loadMarketOptions,
} from "@/features/market-detail/loader"

export const Route = createFileRoute("/markets/$oracleId")({
  validateSearch: marketSearchSchema,
  loaderDeps: ({ search }) => ({
    side: search.side,
    strike: search.strike,
  }),
  loader: async ({ deps, params }) => {
    const market = await loadMarketSnapshot(params.oracleId)

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!market) {
      throw notFound()
    }

    const selectedStrikePriceUsd = deps.strike ?? getDefaultTradeStrike(market)
    const [
      expiryOptions,
      positionMints,
      positionRedeems,
      rangeMints,
      rangeRedeems,
      marketOptions,
    ] = await Promise.all([
      loadExpiryOptions(market),
      getDirectionalPositionMints(250, market.oracleId),
      getDirectionalPositionRedeems(250, market.oracleId),
      getRangeMints(250, market.oracleId),
      getRangeRedeems(250, market.oracleId),
      loadMarketOptions(market),
    ])
    const activityOptions = {
      expiryMs: market.expiryMs,
      oracleId: market.oracleId,
    }

    return {
      expiryOptions,
      initialSide: getInitialSide(deps.side),
      market,
      marketOptions,
      rangeRedemptions: filterRangeRedemptions(rangeRedeems, activityOptions),
      rangeTrades: filterRangeTrades(rangeMints, activityOptions),
      redemptions: filterRedemptions(positionRedeems, activityOptions),
      selectedStrikePriceUsd,
      trades: filterTrades(positionMints, activityOptions),
    }
  },
  pendingComponent: MarketDetailSkeleton,
  component: Market,
})

function Market() {
  const loaderData = Route.useLoaderData()

  return (
    <MarketDetailPage
      expiryOptions={loaderData.expiryOptions}
      initialSide={loaderData.initialSide}
      market={loaderData.market}
      marketOptions={loaderData.marketOptions}
      rangeRedemptions={loaderData.rangeRedemptions}
      rangeTrades={loaderData.rangeTrades}
      redemptions={loaderData.redemptions}
      selectedStrikePriceUsd={loaderData.selectedStrikePriceUsd}
      trades={loaderData.trades}
    />
  )
}
