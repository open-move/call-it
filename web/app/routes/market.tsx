import type { Route } from "./+types/market"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as MarketDetailPage } from "~/components/market-detail/page"
import { loadMarketSnapshot } from "~/lib/callit/market/loaders"
import {
  filterRangeRedemptions,
  filterRangeTrades,
  filterRedemptions,
} from "~/lib/callit/trade/activity"
import { type ToolbarQuote } from "~/lib/callit/trade/types"
import { filterTrades } from "~/lib/callit/trade/trades"
import { PREDICT_QUOTE_DECIMALS } from "~/lib/deepbook/config"
import {
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
  getRangeMints,
  getRangeRedeems,
} from "~/lib/deepbook/predict-client"
import { quoteDirectionalTradeSafe } from "~/lib/deepbook/predict-quotes"

function parseSelectedStrikePriceUsd(value: string | null) {
  if (!value) {
    return undefined
  }

  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : undefined
}

const TOOLBAR_QUOTE_SENDER = "0x797"
const TOOLBAR_QUOTE_QUANTITY = 10n ** BigInt(PREDICT_QUOTE_DECIMALS)

async function loadToolbarQuote({
  expiryMs,
  oracleId,
  selectedStrikePriceUsd,
}: {
  expiryMs: number
  oracleId: string
  selectedStrikePriceUsd: number
}): Promise<ToolbarQuote | null> {
  const quote = await quoteDirectionalTradeSafe({
    expiryMs,
    isUp: true,
    oracleId,
    quantity: TOOLBAR_QUOTE_QUANTITY,
    strikePriceUsd: selectedStrikePriceUsd,
    walletAddress: TOOLBAR_QUOTE_SENDER,
  })

  if (quote.status !== "quoted") {
    return null
  }

  const spread = quote.mintCost - quote.redeemPayout

  return {
    aboveAsk: Number(quote.mintCost),
    aboveBid: Number(quote.redeemPayout),
    spread: Number(spread > 0n ? spread : 0n),
  }
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

  const [
    positionMints,
    positionRedeems,
    rangeMints,
    rangeRedeems,
    toolbarQuote,
  ] = await Promise.all([
    getDirectionalPositionMints(250, market.oracleId),
    getDirectionalPositionRedeems(250, market.oracleId),
    getRangeMints(250, market.oracleId),
    getRangeRedeems(250, market.oracleId),
    loadToolbarQuote({
      expiryMs: market.expiryMs,
      oracleId: market.oracleId,
      selectedStrikePriceUsd,
    }),
  ])
  const activityOptions = {
    expiryMs: market.expiryMs,
    oracleId: market.oracleId,
  }

  return {
    market,
    rangeRedemptions: filterRangeRedemptions(rangeRedeems, activityOptions),
    rangeTrades: filterRangeTrades(rangeMints, activityOptions),
    redemptions: filterRedemptions(positionRedeems, activityOptions),
    selectedStrikePriceUsd,
    toolbarQuote,
    trades: filterTrades(positionMints, activityOptions),
  }
}

export default function Market({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <MarketDetailPage
        market={loaderData.market}
        rangeRedemptions={loaderData.rangeRedemptions}
        rangeTrades={loaderData.rangeTrades}
        redemptions={loaderData.redemptions}
        selectedStrikePriceUsd={loaderData.selectedStrikePriceUsd}
        toolbarQuote={loaderData.toolbarQuote}
        trades={loaderData.trades}
      />
    </AppFrame>
  )
}
