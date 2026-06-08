import { createFileRoute, notFound } from "@tanstack/react-router"
import { z } from "zod"
import { ShieldDetailSkeleton } from "@/components/shared/pending-skeleton"

import { AppFrame } from "@/components/app-frame/app-frame"
import { DetailPage as ShieldDetailPage } from "@/components/shield/detail-page"
import { loadActiveMarketSnapshots } from "@/lib/market-loaders"
import {
  createShieldProducts,
  findShieldProduct,
  isShieldPreset,
} from "@/lib/shield-products"

const shieldSearchSchema = z.object({
  preset: z.string().optional().catch(undefined),
  strike: z.coerce.number().positive().optional().catch(undefined),
})

export const Route = createFileRoute("/shield/$oracleId")({
  validateSearch: shieldSearchSchema,
  pendingComponent: ShieldDetailSkeleton,
  loaderDeps: ({ search }) => ({
    preset: search.preset,
    strike: search.strike,
  }),
  loader: async ({ deps, params }) => {
    const markets = await loadActiveMarketSnapshots()
    const products = createShieldProducts(markets)
    const product = findShieldProduct(
      products,
      params.oracleId,
      deps.strike,
      isShieldPreset(deps.preset) ? deps.preset : undefined
    )

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!product) {
      throw notFound()
    }

    return {
      expiryProducts: products.filter(
        (candidate) =>
          candidate.market.assetSymbol === product.market.assetSymbol &&
          candidate.preset === product.preset
      ),
      product,
    }
  },
  component: ShieldDetail,
})

function ShieldDetail() {
  const { expiryProducts, product } = Route.useLoaderData()

  return (
    <AppFrame>
      <ShieldDetailPage expiryProducts={expiryProducts} product={product} />
    </AppFrame>
  )
}
