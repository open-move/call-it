import { createFileRoute, notFound } from "@tanstack/react-router"

import { CreatorDetailPage } from "@/components/arena/creator-detail-page"
import { getArenaCreator } from "@/services/arena-client"

export const Route = createFileRoute("/arena/creator/$handle")({
  loader: async ({ params }) => {
    const detail = await getArenaCreator(params.handle)

    if (!detail) {
      throw notFound()
    }

    return detail
  },
  component: Creator,
})

function Creator() {
  const { calls, creator } = Route.useLoaderData()

  return <CreatorDetailPage calls={calls} creator={creator} />
}
