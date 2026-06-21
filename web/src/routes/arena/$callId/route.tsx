import { createFileRoute, notFound } from "@tanstack/react-router"

import { CallDetailPage } from "@/components/arena/call-detail-page"
import { getArenaCall } from "@/services/arena-client"

export const Route = createFileRoute("/arena/$callId")({
  loader: async ({ params }) => {
    const detail = await getArenaCall(params.callId)

    if (!detail) {
      throw notFound()
    }

    return detail
  },
  component: CallDetail,
})

function CallDetail() {
  const { activity, call, creator } = Route.useLoaderData()

  return <CallDetailPage activity={activity} call={call} creator={creator} />
}
