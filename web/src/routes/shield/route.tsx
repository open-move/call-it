import { createFileRoute } from "@tanstack/react-router"
import { ShieldSkeleton } from "@/components/shared/pending-skeleton"
import { Page as ShieldPage } from "@/components/shield/page"
import { loadActiveMarketSnapshots } from "@/lib/market-loaders"
import { createShieldProducts } from "@/lib/shield-products"

export const Route = createFileRoute("/shield")({
  pendingComponent: ShieldSkeleton,
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

  return <ShieldPage products={products} />
}
