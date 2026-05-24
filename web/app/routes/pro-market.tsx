import type { Route } from "./+types/pro-market"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as MarketDetailPage } from "~/components/market-detail/page"
import { AppMode } from "~/lib/callit/app-mode"
import { loadMarketSnapshot } from "~/lib/callit/market/loaders"

export async function loader({ params }: Route.LoaderArgs) {
  const oracleId = params.oracleId

  if (!oracleId) {
    throw new Response("Market not found", { status: 404 })
  }

  return { market: await loadMarketSnapshot(oracleId) }
}

export default function ProMarket({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <MarketDetailPage mode={AppMode.Pro} market={loaderData.market} />
    </AppFrame>
  )
}
