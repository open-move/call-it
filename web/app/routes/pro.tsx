import type { Route } from "./+types/pro"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as MarketsPage } from "~/components/markets/page"
import { AppMode } from "~/lib/callit/app-mode"
import { loadActiveMarketSnapshots } from "~/lib/callit/market/loaders"
import { presentProMarkets } from "~/lib/callit/pro/presenter"

export async function loader() {
  const snapshots = await loadActiveMarketSnapshots()

  return {
    markets: presentProMarkets(snapshots),
  }
}

export default function Pro({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <MarketsPage mode={AppMode.Pro} markets={loaderData.markets} />
    </AppFrame>
  )
}
