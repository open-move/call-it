import { createFileRoute } from "@tanstack/react-router"

import { Page as KeeperPage } from "@/components/keeper/page"
import { KeeperSkeleton } from "@/components/shared/pending-skeleton"
import { getKeeperSnapshot } from "@/services/keeper-client"

export const Route = createFileRoute("/keeper")({
  pendingComponent: KeeperSkeleton,
  loader: async () => {
    const snapshot = await getKeeperSnapshot()
    return { snapshot }
  },
  component: Keeper,
})

function Keeper() {
  const { snapshot } = Route.useLoaderData()
  return <KeeperPage snapshot={snapshot} />
}
