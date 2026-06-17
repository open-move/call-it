import { createFileRoute, notFound } from "@tanstack/react-router"
import { z } from "zod"

import { DetailPage as RangeLadderDetailPage } from "@/components/range-ladder/detail-page"
import { ShieldDetailSkeleton } from "@/components/shared/pending-skeleton"
import { loadActiveMarketSnapshots } from "@/lib/market-loaders"
import {
  createRangeLadderProducts,
  findRangeLadderProduct,
  isRangeLadderPreset,
} from "@/lib/range-ladder-products"

const rangeLadderSearchSchema = z.object({
  preset: z.string().optional().catch(undefined),
})

export const Route = createFileRoute("/range-ladder/$oracleId")({
  validateSearch: rangeLadderSearchSchema,
  pendingComponent: ShieldDetailSkeleton,
  loaderDeps: ({ search }) => ({
    preset: search.preset,
  }),
  loader: async ({ deps, params }) => {
    const markets = await loadActiveMarketSnapshots()
    const products = createRangeLadderProducts(markets)
    const product = findRangeLadderProduct(
      products,
      params.oracleId,
      isRangeLadderPreset(deps.preset) ? deps.preset : undefined
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
  component: RangeLadderDetail,
})

function RangeLadderDetail() {
  const { expiryProducts, product } = Route.useLoaderData()

  return (
    <RangeLadderDetailPage expiryProducts={expiryProducts} product={product} />
  )
}
