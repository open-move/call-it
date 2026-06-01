import type { Route } from "./+types/home"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as MarketsPage } from "~/components/markets/page"
import { loadActiveMarketSnapshots } from "~/lib/callit/market/loaders"
import { presentTradeMarkets } from "~/lib/callit/trade/presenter"

export async function loader() {
  const markets = await loadActiveMarketSnapshots()

  return {
    markets: presentTradeMarkets(markets),
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <MarketsPage markets={loaderData.markets} />
    </AppFrame>
  )
}
