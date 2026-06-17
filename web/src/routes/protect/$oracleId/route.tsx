import { createFileRoute, notFound } from "@tanstack/react-router"
import { z } from "zod"

import { DetailPage as ProtectDetailPage } from "@/components/protect/detail-page"
import { ShieldDetailSkeleton } from "@/components/shared/pending-skeleton"
import { loadActiveMarketSnapshots } from "@/lib/market-loaders"
import {
  createProtectProducts,
  findProtectProduct,
  isProtectPreset,
} from "@/lib/protect-products"

const protectSearchSchema = z.object({
  preset: z.string().optional().catch(undefined),
  strike: z.coerce.number().positive().optional().catch(undefined),
})

export const Route = createFileRoute("/protect/$oracleId")({
  validateSearch: protectSearchSchema,
  pendingComponent: ShieldDetailSkeleton,
  loaderDeps: ({ search }) => ({
    preset: search.preset,
    strike: search.strike,
  }),
  loader: async ({ deps, params }) => {
    const markets = await loadActiveMarketSnapshots()
    const products = createProtectProducts(markets)
    const product = findProtectProduct(
      products,
      params.oracleId,
      deps.strike,
      isProtectPreset(deps.preset) ? deps.preset : undefined
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
  component: ProtectDetail,
})

function ProtectDetail() {
  const { expiryProducts, product } = Route.useLoaderData()

  return <ProtectDetailPage expiryProducts={expiryProducts} product={product} />
}
