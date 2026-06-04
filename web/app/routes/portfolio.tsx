import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as PortfolioPage } from "~/components/portfolio/page"
import {
  getPredictOracles,
  getPredictVaultSummary,
} from "~/lib/deepbook/predict-client"

export async function loader() {
  const [oracles, vaultSummary] = await Promise.all([
    getPredictOracles(),
    getPredictVaultSummary(),
  ])

  return { oracles, vaultSummary }
}

export default function Portfolio({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>
}) {
  return (
    <AppFrame>
      <PortfolioPage
        oracles={loaderData.oracles}
        vaultSummary={loaderData.vaultSummary}
      />
    </AppFrame>
  )
}
