import type { Route } from "./+types/market"
import { redirect } from "react-router"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as MarketDetailPage } from "~/components/market-detail/page"
import { loadMarketSnapshot } from "~/lib/callit/market/loaders"
import {
  type ExpiryOption,
  type MarketSnapshot,
} from "~/lib/callit/market/types"
import {
  filterRangeRedemptions,
  filterRangeTrades,
  filterRedemptions,
} from "~/lib/callit/trade/activity"
import { getQuoteableTradeStrike } from "~/lib/callit/trade/strikes"
import { type ToolbarQuote } from "~/lib/callit/trade/types"
import { filterTrades } from "~/lib/callit/trade/trades"
import { PREDICT_QUOTE_DECIMALS } from "~/lib/deepbook/config"
import {
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
  getPredictOracles,
  getRangeMints,
  getRangeRedeems,
} from "~/lib/deepbook/predict-client"
import { quotePredictTradeSafe } from "~/lib/deepbook/predict-quotes"

function parseSelectedStrikePriceUsd(value: string | null) {
  if (!value) {
    return undefined
  }

  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : undefined
}

function parseInitialSide(value: string | null) {
  if (value === "up") {
    return "above" as const
  }

  if (value === "down") {
    return "below" as const
  }

  return undefined
}

function getMarketHref(oracleId: string, strikePriceUsd: number) {
  const searchParams = new URLSearchParams({
    strike: strikePriceUsd.toString(),
  })

  return `/markets/${oracleId}?${searchParams.toString()}`
}

const TOOLBAR_QUOTE_SENDER = "0x797"
const TOOLBAR_QUOTE_QUANTITY = 10n ** BigInt(PREDICT_QUOTE_DECIMALS)

async function loadExpiryOptions(
  market: MarketSnapshot
): Promise<ExpiryOption[]> {
  const oracles = await getPredictOracles()

  return oracles
    .filter((oracle) => {
      return (
        oracle.underlying_asset === market.assetSymbol &&
        (oracle.status === "active" || oracle.oracle_id === market.oracleId)
      )
    })
    .sort(
      (firstOracle, secondOracle) => firstOracle.expiry - secondOracle.expiry
    )
    .map((oracle) => ({
      assetSymbol: oracle.underlying_asset,
      expiryMs: oracle.expiry,
      oracleId: oracle.oracle_id,
      status: oracle.status,
    }))
}

async function loadToolbarQuote({
  expiryMs,
  oracleId,
  selectedStrikePriceUsd,
}: {
  expiryMs: number
  oracleId: string
  selectedStrikePriceUsd: number
}): Promise<ToolbarQuote | null> {
  const quote = await quotePredictTradeSafe({
    expiryMs,
    isUp: true,
    kind: "binary",
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
  const selectedStrikeParam = url.searchParams.get("strike")
  const selectedStrikePriceUsd =
    parseSelectedStrikePriceUsd(selectedStrikeParam)
  const initialSide = parseInitialSide(url.searchParams.get("side"))

  if (!selectedStrikePriceUsd) {
    const quoteableStrikePriceUsd = await getQuoteableTradeStrike(market)

    throw redirect(getMarketHref(market.oracleId, quoteableStrikePriceUsd))
  }

  const [
    expiryOptions,
    positionMints,
    positionRedeems,
    rangeMints,
    rangeRedeems,
    toolbarQuote,
  ] = await Promise.all([
    loadExpiryOptions(market),
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
    expiryOptions,
    initialSide,
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
        expiryOptions={loaderData.expiryOptions}
        initialSide={loaderData.initialSide}
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
