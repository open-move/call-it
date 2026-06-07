import { createFileRoute, notFound, redirect } from "@tanstack/react-router"
import { z } from "zod"

import { AppFrame } from "@/components/app-frame/app-frame"
import { Page as MarketDetailPage } from "@/components/market-detail/page"
import {
  loadActiveMarketSnapshots,
  loadMarketSnapshot,
} from "@/lib/callit/market/loaders"
import {
  type ExpiryOption,
  type MarketSnapshot,
} from "@/lib/callit/market/types"
import {
  filterRangeRedemptions,
  filterRangeTrades,
  filterRedemptions,
} from "@/lib/callit/trade/activity"
import { presentTradeMarkets } from "@/lib/callit/trade/presenter"
import { getQuoteableTradeStrike } from "@/lib/callit/trade/strikes"
import { type ToolbarQuote } from "@/lib/callit/trade/types"
import { filterTrades } from "@/lib/callit/trade/trades"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/deepbook/config"
import {
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
  getPredictOracles,
  getRangeMints,
  getRangeRedeems,
} from "@/lib/deepbook/predict-client"
import { quotePredictTradeSafe } from "@/lib/deepbook/predict-quotes"

const marketSearchSchema = z.object({
  side: z.enum(["up", "down"]).optional().catch(undefined),
  strike: z.coerce.number().positive().optional().catch(undefined),
})

const TOOLBAR_QUOTE_SENDER = "0x797"
const TOOLBAR_QUOTE_QUANTITY = 10n ** BigInt(PREDICT_QUOTE_DECIMALS)

function getInitialSide(value?: "up" | "down") {
  if (value === "up") {
    return "above" as const
  }

  if (value === "down") {
    return "below" as const
  }

  return undefined
}

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

async function loadMarketOptions(market: MarketSnapshot) {
  const activeMarkets = await loadActiveMarketSnapshots()
  const hasCurrentMarket = activeMarkets.some(
    (activeMarket) => activeMarket.oracleId === market.oracleId
  )
  const marketSnapshots = hasCurrentMarket
    ? activeMarkets
    : [...activeMarkets, market]

  return presentTradeMarkets(marketSnapshots)
}

export const Route = createFileRoute("/markets/$oracleId")({
  validateSearch: marketSearchSchema,
  loaderDeps: ({ search }) => ({
    side: search.side,
    strike: search.strike,
  }),
  loader: async ({ deps, params }) => {
    const market = await loadMarketSnapshot(params.oracleId)

    if (!market) {
      throw notFound()
    }

    if (!deps.strike) {
      const quoteableStrikePriceUsd = await getQuoteableTradeStrike(market)

      throw redirect({
        to: "/markets/$oracleId",
        params: { oracleId: market.oracleId },
        search: { strike: quoteableStrikePriceUsd },
      })
    }

    const selectedStrikePriceUsd = deps.strike
    const [
      expiryOptions,
      positionMints,
      positionRedeems,
      rangeMints,
      rangeRedeems,
      marketOptions,
      toolbarQuote,
    ] = await Promise.all([
      loadExpiryOptions(market),
      getDirectionalPositionMints(250, market.oracleId),
      getDirectionalPositionRedeems(250, market.oracleId),
      getRangeMints(250, market.oracleId),
      getRangeRedeems(250, market.oracleId),
      loadMarketOptions(market),
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
      initialSide: getInitialSide(deps.side),
      market,
      marketOptions,
      rangeRedemptions: filterRangeRedemptions(rangeRedeems, activityOptions),
      rangeTrades: filterRangeTrades(rangeMints, activityOptions),
      redemptions: filterRedemptions(positionRedeems, activityOptions),
      selectedStrikePriceUsd,
      toolbarQuote,
      trades: filterTrades(positionMints, activityOptions),
    }
  },
  component: Market,
})

function Market() {
  const loaderData = Route.useLoaderData()

  return (
    <AppFrame>
      <MarketDetailPage
        expiryOptions={loaderData.expiryOptions}
        initialSide={loaderData.initialSide}
        market={loaderData.market}
        marketOptions={loaderData.marketOptions}
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
