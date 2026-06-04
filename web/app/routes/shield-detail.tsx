import type { Route } from "./+types/shield-detail"
import { AppFrame } from "~/components/app-frame/app-frame"
import { DetailPage as ShieldDetailPage } from "~/components/shield/detail-page"
import { loadActiveMarketSnapshots } from "~/lib/callit/market/loaders"
import {
  createShieldProducts,
  findShieldProduct,
  isShieldPreset,
} from "~/lib/callit/shield/products"

function parseStrike(value: string | null) {
  if (!value) {
    return undefined
  }

  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : undefined
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const oracleId = params.oracleId

  if (!oracleId) {
    throw new Response("Shield product not found", { status: 404 })
  }

  const url = new URL(request.url)
  const presetParam = url.searchParams.get("preset")
  const markets = await loadActiveMarketSnapshots()
  const products = createShieldProducts(markets)
  const product = findShieldProduct(
    products,
    oracleId,
    parseStrike(url.searchParams.get("strike")),
    isShieldPreset(presetParam) ? presetParam : undefined
  )

  if (!product) {
    throw new Response("Shield product not found", { status: 404 })
  }

  return {
    expiryProducts: products.filter(
      (candidate) =>
        candidate.market.assetSymbol === product.market.assetSymbol &&
        candidate.preset === product.preset
    ),
    product,
  }
}

export default function ShieldDetail({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <ShieldDetailPage
        expiryProducts={loaderData.expiryProducts}
        product={loaderData.product}
      />
    </AppFrame>
  )
}
