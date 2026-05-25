import type { Route } from "./+types/pro-market"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as MarketDetailPage } from "~/components/market-detail/page"
import { AppMode } from "~/lib/callit/app-mode"
import { loadMarketSnapshot } from "~/lib/callit/market/loaders"
import {
  filterProRangeRedemptions,
  filterProRangeTrades,
  filterProRedemptions,
} from "~/lib/callit/pro/activity"
import { filterProTrades } from "~/lib/callit/pro/trades"
import {
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
  getRangeMints,
  getRangeRedeems,
} from "~/lib/deepbook/predict-client"

function parseSelectedStrikePriceUsd(value: string | null) {
  if (!value) {
    return undefined
  }

  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : undefined
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const oracleId = params.oracleId

  if (!oracleId) {
    throw new Response("Market not found", { status: 404 })
  }

  const market = await loadMarketSnapshot(oracleId)
  const url = new URL(request.url)
  const selectedStrikePriceUsd =
    parseSelectedStrikePriceUsd(url.searchParams.get("strike")) ??
    market.strikePriceUsd

  const [positionMints, positionRedeems, rangeMints, rangeRedeems] =
    await Promise.all([
      getDirectionalPositionMints(250),
      getDirectionalPositionRedeems(250),
      getRangeMints(250),
      getRangeRedeems(250),
    ])
  const activityOptions = {
    expiryMs: market.expiryMs,
    oracleId: market.oracleId,
    selectedStrikePriceUsd,
  }
  const trades = filterProTrades(positionMints, activityOptions)
  const redemptions = filterProRedemptions(positionRedeems, activityOptions)
  const rangeTrades = filterProRangeTrades(rangeMints, activityOptions)
  const rangeRedemptions = filterProRangeRedemptions(
    rangeRedeems,
    activityOptions
  )

  return {
    market,
    rangeRedemptions,
    rangeTrades,
    redemptions,
    selectedStrikePriceUsd,
    trades,
  }
}

export default function ProMarket({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <MarketDetailPage
        market={loaderData.market}
        mode={AppMode.Pro}
        rangeRedemptions={loaderData.rangeRedemptions}
        rangeTrades={loaderData.rangeTrades}
        redemptions={loaderData.redemptions}
        selectedStrikePriceUsd={loaderData.selectedStrikePriceUsd}
        trades={loaderData.trades}
      />
    </AppFrame>
  )
}
