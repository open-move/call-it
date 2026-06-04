import type { Route } from "./+types/pro"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as MarketsPage } from "~/components/markets/page"
import { AppMode } from "~/lib/callit/app-mode"
import { loadActiveMarketSnapshots } from "~/lib/callit/market/loaders"
import { presentProMarkets } from "~/lib/callit/pro/presenter"
import { PredictServerError } from "~/lib/deepbook/predict-client"

export async function loader() {
  try {
    const snapshots = await loadActiveMarketSnapshots()

    return {
      emptyStateMessage: undefined,
      markets: presentProMarkets(snapshots),
    }
  } catch (error) {
    if (error instanceof PredictServerError) {
      return {
        emptyStateMessage:
          "Pro market data is temporarily unavailable because the Predict server could not be reached.",
        markets: [],
      }
    }

    throw error
  }
}

export default function Pro({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <MarketsPage
        emptyStateMessage={loaderData.emptyStateMessage}
        mode={AppMode.Pro}
        markets={loaderData.markets}
      />
    </AppFrame>
  )
}
