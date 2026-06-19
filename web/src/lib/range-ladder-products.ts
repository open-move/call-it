import type { MarketSnapshot } from "@/lib/types/market"
import type {
  RangeLadderPreset,
  RangeLadderProduct,
  RangeLadderRungPreview,
} from "@/lib/types/range-ladder"

interface RangeLadderPresetConfig {
  label: string
  preset: RangeLadderPreset
  bands: Array<{
    costTier: RangeLadderRungPreview["costTier"]
    higherMultiplier: number
    lowerMultiplier: number
    weight: string
  }>
}

const rangeLadderPresetConfigs = [
  {
    label: "Tight",
    preset: "tight",
    bands: [
      { costTier: "low", higherMultiplier: 0.98, lowerMultiplier: 0.95, weight: "1.0x" },
      { costTier: "mid", higherMultiplier: 0.95, lowerMultiplier: 0.92, weight: "1.2x" },
      { costTier: "high", higherMultiplier: 0.92, lowerMultiplier: 0.88, weight: "1.5x" },
    ],
  },
  {
    label: "Balanced",
    preset: "balanced",
    bands: [
      { costTier: "low", higherMultiplier: 0.95, lowerMultiplier: 0.9, weight: "1.0x" },
      { costTier: "mid", higherMultiplier: 0.9, lowerMultiplier: 0.84, weight: "1.5x" },
      { costTier: "high", higherMultiplier: 0.84, lowerMultiplier: 0.76, weight: "2.0x" },
    ],
  },
  {
    label: "Wide",
    preset: "wide",
    bands: [
      { costTier: "low", higherMultiplier: 0.9, lowerMultiplier: 0.82, weight: "1.0x" },
      { costTier: "mid", higherMultiplier: 0.82, lowerMultiplier: 0.72, weight: "1.6x" },
      { costTier: "high", higherMultiplier: 0.72, lowerMultiplier: 0.6, weight: "2.4x" },
    ],
  },
] satisfies RangeLadderPresetConfig[]

function roundDownToTick(value: number, tickSize: number) {
  if (tickSize <= 0) {
    return value
  }

  return Math.floor(value / tickSize) * tickSize
}

function normalizeStrike(market: MarketSnapshot, multiplier: number) {
  const tickSizeUsd = market.tickSizeUsd > 0 ? market.tickSizeUsd : 1
  const candidate = roundDownToTick(
    market.currentPriceUsd * multiplier,
    tickSizeUsd
  )
  const bounded = Math.min(candidate, market.maxStrikeUsd)

  return Math.max(bounded, market.minStrikeUsd)
}

function createRungs(
  market: MarketSnapshot,
  config: RangeLadderPresetConfig
): RangeLadderRungPreview[] {
  return config.bands.flatMap((band) => {
    const lowerStrikeUsd = normalizeStrike(market, band.lowerMultiplier)
    const higherStrikeUsd = normalizeStrike(market, band.higherMultiplier)

    if (lowerStrikeUsd >= higherStrikeUsd) {
      return []
    }

    return [
      {
        costTier: band.costTier,
        higherStrikeUsd,
        lowerStrikeUsd,
        weight: band.weight,
      },
    ]
  })
}

export function getRangeLadderPresetLabel(preset: RangeLadderPreset) {
  return (
    rangeLadderPresetConfigs.find((config) => config.preset === preset)?.label ??
    preset
  )
}

export function createRangeLadderProducts(markets: MarketSnapshot[]) {
  const products: RangeLadderProduct[] = []

  for (const market of markets) {
    if (market.status !== "active" || market.expiryMs <= Date.now()) {
      continue
    }

    for (const config of rangeLadderPresetConfigs) {
      const rungs = createRungs(market, config)

      if (rungs.length === 0) {
        continue
      }

      const lowestStrikeUsd = Math.min(
        ...rungs.map((rung) => rung.lowerStrikeUsd)
      )

      products.push({
        distancePercent:
          ((lowestStrikeUsd - market.currentPriceUsd) / market.currentPriceUsd) *
          100,
        id: `${market.oracleId}-${config.preset}`,
        market,
        preset: config.preset,
        rungs,
        status: "preview",
      })
    }
  }

  return products.sort(
    (firstProduct, secondProduct) =>
      firstProduct.market.expiryMs - secondProduct.market.expiryMs ||
      firstProduct.market.assetSymbol.localeCompare(
        secondProduct.market.assetSymbol
      ) ||
      firstProduct.preset.localeCompare(secondProduct.preset)
  )
}
