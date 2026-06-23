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
import {
  marketSearchSchema,
  getInitialSide,
} from "@/features/market-detail/search"
import {
  loadExpiryOptions,
  loadMarketOptions,
} from "@/features/market-detail/loader"

export const Route = createFileRoute("/markets/$oracleId")({
  validateSearch: marketSearchSchema,
  // The strike/side/mode/range search params are UI selections (seeds for the
  // ticket's local state) — they don't change what we fetch. Keep them OUT of
  // loaderDeps so changing them (e.g. pinning the strike after a trade) updates
  // the URL without re-running this heavy loader, which would otherwise show the
  // route skeleton and remount the page. The loader keys on params.oracleId.
  loader: async ({ params }) => {
    const market = await loadMarketSnapshot(params.oracleId)

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!market) {
      throw notFound()
    }

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
      market,
      marketOptions,
      rangeRedemptions: filterRangeRedemptions(rangeRedeems, activityOptions),
      rangeTrades: filterRangeTrades(rangeMints, activityOptions),
      redemptions: filterRedemptions(positionRedeems, activityOptions),
      trades: filterTrades(positionMints, activityOptions),
    }
  },
  pendingComponent: MarketDetailSkeleton,
  component: Market,
})

function Market() {
  const loaderData = Route.useLoaderData()
  const search = Route.useSearch()
  const selectedStrikePriceUsd =
    search.strike ?? getDefaultTradeStrike(loaderData.market)

  return (
    <MarketDetailPage
      expiryOptions={loaderData.expiryOptions}
      initialHigherStrikePriceUsd={search.higherStrike}
      initialLowerStrikePriceUsd={search.lowerStrike}
      initialMode={search.mode}
      initialSide={getInitialSide(search.side)}
      market={loaderData.market}
      marketOptions={loaderData.marketOptions}
      rangeRedemptions={loaderData.rangeRedemptions}
      rangeTrades={loaderData.rangeTrades}
      redemptions={loaderData.redemptions}
      selectedStrikePriceUsd={selectedStrikePriceUsd}
      trades={loaderData.trades}
    />
  )
}
