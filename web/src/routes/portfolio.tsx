import { createFileRoute } from "@tanstack/react-router"
import { PortfolioSkeleton } from "@/components/shared/pending-skeleton"

import { AppFrame } from "@/components/app-frame/app-frame"
import { Page as PortfolioPage } from "@/components/portfolio/page"
import {
  getPredictOracles,
  getPredictVaultSummary,
} from "@/services/predict-client"

export const Route = createFileRoute("/portfolio")({
  pendingComponent: PortfolioSkeleton,
  loader: async () => {
    const [oracles, vaultSummary] = await Promise.all([
      getPredictOracles(),
      getPredictVaultSummary(),
    ])

    return { oracles, vaultSummary }
  },
  component: Portfolio,
})

function Portfolio() {
  const { oracles, vaultSummary } = Route.useLoaderData()

  return (
    <AppFrame>
      <PortfolioPage oracles={oracles} vaultSummary={vaultSummary} />
    </AppFrame>
  )
}
