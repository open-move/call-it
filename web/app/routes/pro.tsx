import type { Route } from "./+types/pro"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as MarketsPage } from "~/components/markets/page"
import { AppMode } from "~/lib/callit/app-mode"
import { loadActiveMarketSnapshots } from "~/lib/callit/market/loaders"

export async function loader() {
  return {
    markets: await loadActiveMarketSnapshots(),
  }
}

export default function Pro({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <MarketsPage mode={AppMode.Pro} markets={loaderData.markets} />
    </AppFrame>
  )
}
