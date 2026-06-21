import { createFileRoute } from "@tanstack/react-router"

import { Page as ArenaPage } from "@/components/arena/page"
import { ArenaSkeleton } from "@/components/shared/pending-skeleton"
import { getArenaPageModel } from "@/services/arena-client"

export const Route = createFileRoute("/arena/")({
  loader: getArenaPageModel,
  pendingComponent: ArenaSkeleton,
  component: Arena,
})

function Arena() {
  const model = Route.useLoaderData()

  return <ArenaPage model={model} />
}
