import type { Route } from "./+types/shield"
import { AppFrame } from "~/components/app-frame/app-frame"
import { Page as ShieldPage } from "~/components/shield/page"
import { loadActiveMarketSnapshots } from "~/lib/callit/market/loaders"
import { createShieldProducts } from "~/lib/callit/shield/products"

export async function loader({}: Route.LoaderArgs) {
  const markets = await loadActiveMarketSnapshots()

  return {
    products: createShieldProducts(markets),
  }
}

export default function Shield({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <ShieldPage products={loaderData.products} />
    </AppFrame>
  )
}
