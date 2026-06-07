import { createFileRoute } from "@tanstack/react-router"
import { AppFrame } from "@/components/app-frame/app-frame"
import { Page as MarketsPage } from "@/components/markets/page"
import { type MarketPricePoint } from "@/lib/callit/market/types"
import { loadActiveMarketSnapshots } from "@/lib/callit/market/loaders"
import {
  type PredictionActivity,
  type TradeMarketActivity,
} from "@/lib/callit/trade/types"
import { presentTradeMarkets } from "@/lib/callit/trade/presenter"
import {
  getDirectionalPositionMints,
  getRangeMints,
} from "@/lib/deepbook/predict-client"
import {
  type DirectionalPositionMintEvent,
  type RangeMintEvent,
} from "@/lib/deepbook/predict-types"

const QUOTE_SCALE = 1_000_000
const INDEX_ACTIVITY_LIMIT = 500
const VOLUME_SPARKLINE_BUCKETS = 18

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

function getVolumeSparklinePoints(
  events: Array<DirectionalPositionMintEvent | RangeMintEvent>
): MarketPricePoint[] {
  const sortedEvents = events
    .slice()
    .sort(
      (firstEvent, secondEvent) =>
        firstEvent.checkpoint_timestamp_ms - secondEvent.checkpoint_timestamp_ms
    )
  const firstEvent = sortedEvents[0]
  const lastEvent = sortedEvents.at(-1)

  if (!firstEvent || !lastEvent) {
    return []
  }

  const startMs = firstEvent.checkpoint_timestamp_ms
  const endMs = lastEvent.checkpoint_timestamp_ms
  const bucketSizeMs = Math.max(
    1,
    Math.ceil((endMs - startMs + 1) / VOLUME_SPARKLINE_BUCKETS)
  )
  const buckets = Array.from({ length: VOLUME_SPARKLINE_BUCKETS }, () => 0)

  for (const event of sortedEvents) {
    const bucketIndex = Math.min(
      VOLUME_SPARKLINE_BUCKETS - 1,
      Math.floor((event.checkpoint_timestamp_ms - startMs) / bucketSizeMs)
    )

    buckets[bucketIndex] += event.cost / QUOTE_SCALE
  }

  return buckets.map((valueUsd, index) => ({
    timestampMs: startMs + index * bucketSizeMs,
    valueUsd,
  }))
}

function getPredictionActivity(
  positionMints: DirectionalPositionMintEvent[],
  rangeMints: RangeMintEvent[]
): PredictionActivity {
  const upVolumeUsd = positionMints.reduce(
    (totalVolume, event) =>
      totalVolume + (event.is_up ? event.cost / QUOTE_SCALE : 0),
    0
  )
  const downVolumeUsd = positionMints.reduce(
    (totalVolume, event) =>
      totalVolume + (!event.is_up ? event.cost / QUOTE_SCALE : 0),
    0
  )
  const rangeVolumeUsd = rangeMints.reduce(
    (totalVolume, event) => totalVolume + event.cost / QUOTE_SCALE,
    0
  )
  const events = [...positionMints, ...rangeMints]

  return {
    downVolumeUsd,
    rangeVolumeUsd,
    recentTradeCount: events.length,
    recentVolumeUsd: upVolumeUsd + downVolumeUsd + rangeVolumeUsd,
    upVolumeUsd,
    volumeSparkline: getVolumeSparklinePoints(events),
  }
}

export const Route = createFileRoute("/")({
  loader: async () => {
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
      predictionActivity: getPredictionActivity(positionMints, rangeMints),
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
