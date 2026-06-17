import { createFileRoute } from "@tanstack/react-router"

import { Page as RangeLadderPage } from "@/components/range-ladder/page"
import { loadActiveMarketSnapshots } from "@/lib/market-loaders"
import { createRangeLadderProducts } from "@/lib/range-ladder-products"

export const Route = createFileRoute("/range-ladder/")({
  loader: async () => {
    const markets = await loadActiveMarketSnapshots()

    return {
      products: createRangeLadderProducts(markets),
    }
  },
  component: RangeLadder,
})

function RangeLadder() {
  const { products } = Route.useLoaderData()

  return <RangeLadderPage products={products} />
}
