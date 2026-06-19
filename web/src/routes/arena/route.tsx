import { createFileRoute } from "@tanstack/react-router"

import { Page as ArenaPage } from "@/components/arena/page"
import { getArenaPageModel } from "@/services/arena-client"

export const Route = createFileRoute("/arena")({
  loader: getArenaPageModel,
  component: Arena,
})

function Arena() {
  const model = Route.useLoaderData()

  return <ArenaPage model={model} />
}
