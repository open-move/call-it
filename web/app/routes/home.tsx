import type { Route } from "./+types/home"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as MarketsPage } from "~/components/markets/page"
import { loadActiveMarketSnapshots } from "~/lib/callit/market/loaders"
import { type TradeMarketActivity } from "~/lib/callit/trade/types"
import { presentTradeMarkets } from "~/lib/callit/trade/presenter"
import {
  getDirectionalPositionMints,
  getRangeMints,
} from "~/lib/deepbook/predict-client"
import {
  type DirectionalPositionMintEvent,
  type RangeMintEvent,
} from "~/lib/deepbook/predict-types"

const QUOTE_SCALE = 1_000_000
const INDEX_ACTIVITY_LIMIT = 500

function addMarketActivity(
  activityByOracleId: Map<string, TradeMarketActivity>,
  event: DirectionalPositionMintEvent | RangeMintEvent
) {
  const currentActivity = activityByOracleId.get(event.oracle_id) ?? {
    tradeCount: 0,
    volumeUsd: 0,
  }

  activityByOracleId.set(event.oracle_id, {
    tradeCount: currentActivity.tradeCount + 1,
    volumeUsd: currentActivity.volumeUsd + event.cost / QUOTE_SCALE,
  })
}

function getMarketActivityByOracleId(
  positionMints: DirectionalPositionMintEvent[],
  rangeMints: RangeMintEvent[]
) {
  const activityByOracleId = new Map<string, TradeMarketActivity>()

  for (const event of positionMints) {
    addMarketActivity(activityByOracleId, event)
  }

  for (const event of rangeMints) {
    addMarketActivity(activityByOracleId, event)
  }

  return activityByOracleId
}

export async function loader() {
  const [markets, positionMints, rangeMints] = await Promise.all([
    loadActiveMarketSnapshots(),
    getDirectionalPositionMints(INDEX_ACTIVITY_LIMIT),
    getRangeMints(INDEX_ACTIVITY_LIMIT),
  ])
  const activityByOracleId = getMarketActivityByOracleId(
    positionMints,
    rangeMints
  )

  return {
    markets: await presentTradeMarkets(markets, activityByOracleId),
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <MarketsPage markets={loaderData.markets} />
    </AppFrame>
  )
}
