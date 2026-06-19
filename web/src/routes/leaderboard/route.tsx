import { createFileRoute } from "@tanstack/react-router"

import { Page as LeaderboardPage } from "@/components/leaderboard/page"
import { LeaderboardSkeleton } from "@/components/shared/pending-skeleton"
import { buildLeaderboardModel } from "@/lib/leaderboard/calculations"
import type {
  LeaderboardPeriod,
  LeaderboardPeriodModels,
} from "@/lib/leaderboard/types"
import {
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
  getRangeMints,
  getRangeRedeems,
} from "@/services/predict-client"

const LEADERBOARD_EVENT_LIMIT = 2_000
const DAY_MS = 24 * 60 * 60 * 1_000

const leaderboardPeriods = [
  { id: "today", startsAtMsOffset: DAY_MS },
  { id: "weekly", startsAtMsOffset: 7 * DAY_MS },
  { id: "monthly", startsAtMsOffset: 30 * DAY_MS },
  { id: "allTime" },
] satisfies { id: LeaderboardPeriod; startsAtMsOffset?: number }[]

function filterEventsByPeriod<
  TEvent extends { checkpoint_timestamp_ms: number },
>(events: TEvent[], startsAtMs?: number) {
  return startsAtMs === undefined
    ? events
    : events.filter((event) => event.checkpoint_timestamp_ms >= startsAtMs)
}

export const Route = createFileRoute("/leaderboard")({
  pendingComponent: LeaderboardSkeleton,
  loader: async () => {
    const [directionalMints, directionalRedeems, rangeMints, rangeRedeems] =
      await Promise.all([
        getDirectionalPositionMints(LEADERBOARD_EVENT_LIMIT),
        getDirectionalPositionRedeems(LEADERBOARD_EVENT_LIMIT),
        getRangeMints(LEADERBOARD_EVENT_LIMIT),
        getRangeRedeems(LEADERBOARD_EVENT_LIMIT),
      ])
    const generatedAtMs = Date.now()
    const models = Object.fromEntries(
      leaderboardPeriods.map(({ id, startsAtMsOffset }) => {
        const startsAtMs =
          startsAtMsOffset === undefined
            ? undefined
            : generatedAtMs - startsAtMsOffset

        return [
          id,
          buildLeaderboardModel({
            directionalMints: filterEventsByPeriod(
              directionalMints,
              startsAtMs
            ),
            directionalRedeems: filterEventsByPeriod(
              directionalRedeems,
              startsAtMs
            ),
            generatedAtMs,
            rangeMints: filterEventsByPeriod(rangeMints, startsAtMs),
            rangeRedeems: filterEventsByPeriod(rangeRedeems, startsAtMs),
          }),
        ]
      })
    ) as LeaderboardPeriodModels

    return {
      models,
    }
  },
  component: Leaderboard,
})

function Leaderboard() {
  const { models } = Route.useLoaderData()

  return <LeaderboardPage models={models} />
}
