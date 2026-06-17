import type { MarketSnapshot } from "@/lib/types/market"
import type { ProtectPreset, ProtectProduct } from "@/lib/types/protect"

interface ProtectPresetConfig {
  label: string
  multiplier: number
  preset: ProtectPreset
}

const protectPresetConfigs = [
  { label: "Near", multiplier: 0.95, preset: "near" },
  { label: "Balanced", multiplier: 0.85, preset: "balanced" },
  { label: "Tail", multiplier: 0.7, preset: "tail" },
] satisfies ProtectPresetConfig[]

function roundDownToTick(value: number, tickSize: number) {
  if (tickSize <= 0) {
    return value
  }

  return Math.floor(value / tickSize) * tickSize
}

function normalizeTriggerStrike(market: MarketSnapshot, multiplier: number) {
  const tickSizeUsd = market.tickSizeUsd > 0 ? market.tickSizeUsd : 1
  const candidate = roundDownToTick(
    market.currentPriceUsd * multiplier,
    tickSizeUsd
  )
  const bounded = Math.min(candidate, market.maxStrikeUsd)

  return Math.max(bounded, market.minStrikeUsd)
}

function isEligibleTrigger(market: MarketSnapshot, triggerStrikeUsd: number) {
  return (
    market.status === "active" &&
    market.expiryMs > Date.now() &&
    triggerStrikeUsd >= market.minStrikeUsd &&
    triggerStrikeUsd <= market.maxStrikeUsd &&
    triggerStrikeUsd < market.currentPriceUsd
  )
}

export function getProtectPresetLabel(preset: ProtectPreset) {
  return (
    protectPresetConfigs.find((config) => config.preset === preset)?.label ??
    preset
  )
}

export function createProtectProducts(markets: MarketSnapshot[]) {
  const products: ProtectProduct[] = []
  const seenProducts = new Set<string>()

  for (const market of markets) {
    for (const config of protectPresetConfigs) {
      const triggerStrikeUsd = normalizeTriggerStrike(market, config.multiplier)

      if (!isEligibleTrigger(market, triggerStrikeUsd)) {
        continue
      }

      const dedupeKey = `${market.oracleId}-${config.preset}-${triggerStrikeUsd}`

      if (seenProducts.has(dedupeKey)) {
        continue
      }

      seenProducts.add(dedupeKey)
      products.push({
        direction: "down",
        distancePercent:
          ((triggerStrikeUsd - market.currentPriceUsd) /
            market.currentPriceUsd) *
          100,
        id: dedupeKey,
        market,
        preset: config.preset,
        status: "preview",
        triggerStrikeUsd,
      })
    }
  }

  return products.sort(
    (firstProduct, secondProduct) =>
      firstProduct.market.expiryMs - secondProduct.market.expiryMs ||
      firstProduct.market.assetSymbol.localeCompare(
        secondProduct.market.assetSymbol
      ) ||
      firstProduct.triggerStrikeUsd - secondProduct.triggerStrikeUsd
  )
}

export function findProtectProduct(
  products: ProtectProduct[],
  oracleId: string,
  strikePriceUsd?: number,
  preset?: ProtectPreset
) {
  const oracleProducts = products.filter(
    (product) => product.market.oracleId === oracleId
  )

  if (strikePriceUsd !== undefined) {
    const matchingStrike = oracleProducts.find(
      (product) => product.triggerStrikeUsd === strikePriceUsd
    )

    if (matchingStrike) {
      return matchingStrike
    }
  }

  if (preset) {
    const matchingPreset = oracleProducts.find(
      (product) => product.preset === preset
    )

    if (matchingPreset) {
      return matchingPreset
    }
  }

  return (
    oracleProducts.find((product) => product.preset === "balanced") ??
    oracleProducts[0]
  )
}

export function isProtectPreset(value: unknown): value is ProtectPreset {
  return value === "near" || value === "balanced" || value === "tail"
}
