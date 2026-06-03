import { type MarketSnapshot } from "~/lib/callit/market/types"

import { type ShieldPreset, type ShieldProduct } from "./types"

interface PresetConfig {
  budgetBps: number
  label: string
  multiplier: number
  preset: ShieldPreset
}

const presetConfigs = [
  { budgetBps: 2500, label: "Light", multiplier: 0.95, preset: "light" },
  {
    budgetBps: 4000,
    label: "Balanced",
    multiplier: 0.85,
    preset: "balanced",
  },
  { budgetBps: 5000, label: "Tail", multiplier: 0.7, preset: "tail" },
] satisfies PresetConfig[]

export function getShieldPresetLabel(preset: ShieldPreset) {
  return presetConfigs.find((config) => config.preset === preset)?.label ?? preset
}

function roundDownToTick(value: number, tickSize: number) {
  if (tickSize <= 0) {
    return value
  }

  return Math.floor(value / tickSize) * tickSize
}

function normalizeProtectionStrike(market: MarketSnapshot, multiplier: number) {
  const tickSizeUsd = market.tickSizeUsd > 0 ? market.tickSizeUsd : 1
  const candidate = roundDownToTick(
    market.currentPriceUsd * multiplier,
    tickSizeUsd
  )
  const bounded = Math.min(candidate, market.maxStrikeUsd)

  return Math.max(bounded, market.minStrikeUsd)
}

function isEligibleStrike(market: MarketSnapshot, strikePriceUsd: number) {
  return (
    market.status === "active" &&
    market.expiryMs > Date.now() &&
    strikePriceUsd >= market.minStrikeUsd &&
    strikePriceUsd <= market.maxStrikeUsd &&
    strikePriceUsd < market.currentPriceUsd
  )
}

export function getShieldProductHref(product: ShieldProduct) {
  const searchParams = new URLSearchParams({
    preset: product.preset,
    strike: product.protectionStrikeUsd.toString(),
  })

  return `/shield/${product.market.oracleId}?${searchParams.toString()}`
}

export function createShieldProducts(markets: MarketSnapshot[]) {
  const products: ShieldProduct[] = []
  const seenProducts = new Set<string>()

  for (const market of markets) {
    for (const config of presetConfigs) {
      const protectionStrikeUsd = normalizeProtectionStrike(
        market,
        config.multiplier
      )

      if (!isEligibleStrike(market, protectionStrikeUsd)) {
        continue
      }

      const id = `${market.oracleId}-${config.preset}-${protectionStrikeUsd}`

      if (seenProducts.has(id)) {
        continue
      }

      seenProducts.add(id)
      products.push({
        distancePercent:
          ((protectionStrikeUsd - market.currentPriceUsd) /
            market.currentPriceUsd) *
          100,
        distanceUsd: protectionStrikeUsd - market.currentPriceUsd,
        hedgeBudgetBps: config.budgetBps,
        id,
        market,
        preset: config.preset,
        protectionStrikeUsd,
        status: "active",
      })
    }
  }

  return products.sort(
    (firstProduct, secondProduct) =>
      firstProduct.market.expiryMs - secondProduct.market.expiryMs ||
      firstProduct.market.assetSymbol.localeCompare(
        secondProduct.market.assetSymbol
      ) ||
      firstProduct.protectionStrikeUsd - secondProduct.protectionStrikeUsd
  )
}

export function findShieldProduct(
  products: ShieldProduct[],
  oracleId: string,
  strikePriceUsd?: number,
  preset?: ShieldPreset
) {
  const oracleProducts = products.filter(
    (product) => product.market.oracleId === oracleId
  )

  if (strikePriceUsd !== undefined) {
    const matchingStrike = oracleProducts.find(
      (product) => product.protectionStrikeUsd === strikePriceUsd
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

export function isShieldPreset(value: unknown): value is ShieldPreset {
  return value === "light" || value === "balanced" || value === "tail"
}
