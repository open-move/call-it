import { createFileRoute } from "@tanstack/react-router"

import { Page as ProtectPage } from "@/components/protect/page"
import { loadActiveMarketSnapshots } from "@/lib/market-loaders"
import { createProtectProducts } from "@/lib/protect-products"

export const Route = createFileRoute("/protect/")({
  loader: async () => {
    const markets = await loadActiveMarketSnapshots()

    return {
      products: createProtectProducts(markets),
    }
  },
  component: Protect,
})

function Protect() {
  const { products } = Route.useLoaderData()

  return <ProtectPage products={products} />
}
