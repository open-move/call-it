import type { Route } from "./+types/home"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as MarketsPage } from "~/components/markets/page"
import { AppMode } from "~/lib/callit/app-mode"
import { loadActiveMarketSnapshots } from "~/lib/callit/market/loaders"
import { presentSimpleMarket } from "~/lib/callit/simple/presenter"

export async function loader() {
  const markets = await loadActiveMarketSnapshots()

  return {
    markets: markets.map((market) => presentSimpleMarket(market)),
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <MarketsPage mode={AppMode.Simple} markets={loaderData.markets} />
    </AppFrame>
  )
}
