import type { Route } from "./+types/home"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as MarketsPage } from "~/components/markets/page"
import { AppMode } from "~/lib/callit/app-mode"
import { loadActiveMarketSnapshots } from "~/lib/callit/market/loaders"
import { presentSimpleMarket } from "~/lib/callit/simple/presenter"
import { PredictServerError } from "~/lib/deepbook/predict-client"

export async function loader() {
  try {
    const markets = await loadActiveMarketSnapshots()

    return {
      emptyStateMessage: undefined,
      markets: markets.map((market) => presentSimpleMarket(market)),
    }
  } catch (error) {
    if (error instanceof PredictServerError) {
      return {
        emptyStateMessage:
          "Market data is temporarily unavailable because the Predict server could not be reached.",
        markets: [],
      }
    }

    throw error
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <MarketsPage
        emptyStateMessage={loaderData.emptyStateMessage}
        mode={AppMode.Simple}
        markets={loaderData.markets}
      />
    </AppFrame>
  )
}
