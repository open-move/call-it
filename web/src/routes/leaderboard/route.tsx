import { createFileRoute } from "@tanstack/react-router"

import { Page as LeaderboardPage } from "@/components/leaderboard/page"
import { LeaderboardSkeleton } from "@/components/shared/pending-skeleton"
import { buildLeaderboardModel } from "@/lib/leaderboard/calculations"
import {
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
  getRangeMints,
  getRangeRedeems,
} from "@/services/predict-client"

const LEADERBOARD_EVENT_LIMIT = 2_000

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

    return {
      model: buildLeaderboardModel({
        directionalMints,
        directionalRedeems,
        rangeMints,
        rangeRedeems,
      }),
    }
  },
  component: Leaderboard,
})

function Leaderboard() {
  const { model } = Route.useLoaderData()

  return <LeaderboardPage model={model} />
}
