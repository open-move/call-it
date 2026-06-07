import { QUOTE_SCALE } from "@/lib/config"
import type {MarketPricePoint} from "@/lib/types/market";
import type {DirectionalPositionMintEvent, RangeMintEvent} from "@/lib/types/predict";
import type {PredictionActivity, TradeMarketActivity} from "@/lib/types/trade";

export const INDEX_ACTIVITY_LIMIT = 500
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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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

export function buildPredictionActivity(
  positionMints: DirectionalPositionMintEvent[],
  rangeMints: RangeMintEvent[]
) {
  const activityByOracleId = getMarketActivityByOracleId(
    positionMints,
    rangeMints
  )

  return {
    activityByOracleId,
    predictionActivity: getPredictionActivity(positionMints, rangeMints),
  }
}
