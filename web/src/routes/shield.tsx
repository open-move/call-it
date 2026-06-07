import { createFileRoute } from "@tanstack/react-router"

import { AppFrame } from "@/components/app-frame/app-frame"
import { Page as ShieldPage } from "@/components/shield/page"
import { loadActiveMarketSnapshots } from "@/lib/callit/market/loaders"
import { createShieldProducts } from "@/lib/callit/shield/products"

export const Route = createFileRoute("/shield")({
  loader: async () => {
    const markets = await loadActiveMarketSnapshots()

    return {
      products: createShieldProducts(markets),
    }
  },
  component: Shield,
})

function Shield() {
  const { products } = Route.useLoaderData()

  return (
    <AppFrame>
      <ShieldPage products={products} />
    </AppFrame>
  )
}
