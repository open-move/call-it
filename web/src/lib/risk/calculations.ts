import { PREDICT_PRICE_SCALE, QUOTE_SCALE } from "@/lib/config"
import type {
  DirectionalPositionMintEvent,
  DirectionalPositionRedeemEvent,
  OracleInfo,
  RangeMintEvent,
  RangeRedeemEvent,
} from "@/lib/types/predict"

import type {
  RiskExposureRow,
  RiskInput,
  RiskModel,
  RiskReport,
  RiskScenarioDefinition,
  RiskScenarioRow,
} from "./types"

interface DirectionalAccumulator {
  cost: number
  expiryMs: number
  isUp: boolean
  lastActivityAtMs: number
  oracleId: string
  quantityMinted: number
  quantityRedeemed: number
  strike: number
}

interface RangeAccumulator {
  cost: number
  expiryMs: number
  higherStrike: number
  lastActivityAtMs: number
  lowerStrike: number
  oracleId: string
  quantityMinted: number
  quantityRedeemed: number
}

const scenarioDefinitions = [
  {
    id: "minus-5-sigma",
    label: "-5σ",
    shockPercent: -0.35,
    sigmaLabel: "-5σ",
  },
  {
    id: "minus-3-sigma",
    label: "-3σ",
    shockPercent: -0.21,
    sigmaLabel: "-3σ",
  },
  {
    id: "minus-1-sigma",
    label: "-1σ",
    shockPercent: -0.07,
    sigmaLabel: "-1σ",
  },
  { id: "current", label: "Current", shockPercent: 0, sigmaLabel: "0σ" },
  {
    id: "plus-1-sigma",
    label: "+1σ",
    shockPercent: 0.07,
    sigmaLabel: "+1σ",
  },
  {
    id: "plus-3-sigma",
    label: "+3σ",
    shockPercent: 0.21,
    sigmaLabel: "+3σ",
  },
  {
    id: "plus-5-sigma",
    label: "+5σ",
    shockPercent: 0.35,
    sigmaLabel: "+5σ",
  },
] satisfies RiskScenarioDefinition[]

function toUsdPrice(value: number) {
  return value / PREDICT_PRICE_SCALE
}

function toQuoteAmount(value: number) {
  return value / QUOTE_SCALE
}

function getOracleMap(oracles: OracleInfo[]) {
  return new Map(oracles.map((oracle) => [oracle.oracle_id, oracle]))
}

function getAssetSymbol(oracleById: Map<string, OracleInfo>, oracleId: string) {
  return oracleById.get(oracleId)?.underlying_asset ?? "Market"
}

function getDirectionalKey(
  event: DirectionalPositionMintEvent | DirectionalPositionRedeemEvent
) {
  return `${event.oracle_id}:${event.expiry}:${event.strike}:${event.is_up}`
}

function getRangeKey(event: RangeMintEvent | RangeRedeemEvent) {
  return `${event.oracle_id}:${event.expiry}:${event.lower_strike}:${event.higher_strike}`
}

function getDirectionalAccumulator(
  positions: Map<string, DirectionalAccumulator>,
  event: DirectionalPositionMintEvent | DirectionalPositionRedeemEvent
) {
  const key = getDirectionalKey(event)
  const currentPosition = positions.get(key)

  if (currentPosition) {
    return currentPosition
  }

  const position = {
    cost: 0,
    expiryMs: event.expiry,
    isUp: event.is_up,
    lastActivityAtMs: event.checkpoint_timestamp_ms,
    oracleId: event.oracle_id,
    quantityMinted: 0,
    quantityRedeemed: 0,
    strike: event.strike,
  }

  positions.set(key, position)
  return position
}

function getRangeAccumulator(
  positions: Map<string, RangeAccumulator>,
  event: RangeMintEvent | RangeRedeemEvent
) {
  const key = getRangeKey(event)
  const currentPosition = positions.get(key)

  if (currentPosition) {
    return currentPosition
  }

  const position = {
    cost: 0,
    expiryMs: event.expiry,
    higherStrike: event.higher_strike,
    lastActivityAtMs: event.checkpoint_timestamp_ms,
    lowerStrike: event.lower_strike,
    oracleId: event.oracle_id,
    quantityMinted: 0,
    quantityRedeemed: 0,
  }

  positions.set(key, position)
  return position
}

function getOpenCostBasis(
  cost: number,
  quantityMinted: number,
  openQuantity: number
) {
  if (quantityMinted <= 0 || openQuantity <= 0) {
    return 0
  }

  return cost * (openQuantity / quantityMinted)
}

function getLatestSpotByOracle(input: RiskInput) {
  const spotByOracleId = new Map<string, number>()

  for (const oracleState of input.oracleStates) {
    const latestSpot = oracleState.state.latest_price?.spot
    const settlementPrice = oracleState.state.oracle.settlement_price
    const spot = latestSpot ?? settlementPrice

    if (spot !== null) {
      spotByOracleId.set(oracleState.oracleId, toUsdPrice(spot))
    }
  }

  return spotByOracleId
}

function getDirectionalPayout(
  exposure: DirectionalAccumulator,
  settlementPriceUsd: number,
  openQuantity: number
) {
  const strikePriceUsd = toUsdPrice(exposure.strike)
  const wins = exposure.isUp
    ? settlementPriceUsd > strikePriceUsd
    : settlementPriceUsd <= strikePriceUsd

  return wins ? toQuoteAmount(openQuantity) : 0
}

function getRangePayout(
  exposure: RangeAccumulator,
  settlementPriceUsd: number,
  openQuantity: number
) {
  const lowerStrikePriceUsd = toUsdPrice(exposure.lowerStrike)
  const higherStrikePriceUsd = toUsdPrice(exposure.higherStrike)
  const wins =
    settlementPriceUsd >= lowerStrikePriceUsd &&
    settlementPriceUsd <= higherStrikePriceUsd

  return wins ? toQuoteAmount(openQuantity) : 0
}

function getWeightedSettlementPrice(
  exposureRows: RiskExposureRow[],
  spotByOracleId: Map<string, number>,
  shockPercent: number
) {
  let weightedPrice = 0
  let totalWeight = 0

  for (const exposure of exposureRows) {
    const spot = spotByOracleId.get(exposure.oracleId)

    if (spot === undefined) {
      continue
    }

    const weight = Math.max(exposure.maxPayoutUsd, 1)
    weightedPrice += spot * (1 + shockPercent) * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? weightedPrice / totalWeight : 0
}

function reconstructDirectionalExposures(input: RiskInput) {
  const positions = new Map<string, DirectionalAccumulator>()

  for (const event of input.directionalMints) {
    const position = getDirectionalAccumulator(positions, event)

    position.quantityMinted += event.quantity
    position.cost += event.cost
    position.lastActivityAtMs = Math.max(
      position.lastActivityAtMs,
      event.checkpoint_timestamp_ms
    )
  }

  for (const event of input.directionalRedeems) {
    const position = getDirectionalAccumulator(positions, event)

    position.quantityRedeemed += event.quantity
    position.lastActivityAtMs = Math.max(
      position.lastActivityAtMs,
      event.checkpoint_timestamp_ms
    )
  }

  return Array.from(positions.values())
}

function reconstructRangeExposures(input: RiskInput) {
  const positions = new Map<string, RangeAccumulator>()

  for (const event of input.rangeMints) {
    const position = getRangeAccumulator(positions, event)

    position.quantityMinted += event.quantity
    position.cost += event.cost
    position.lastActivityAtMs = Math.max(
      position.lastActivityAtMs,
      event.checkpoint_timestamp_ms
    )
  }

  for (const event of input.rangeRedeems) {
    const position = getRangeAccumulator(positions, event)

    position.quantityRedeemed += event.quantity
    position.lastActivityAtMs = Math.max(
      position.lastActivityAtMs,
      event.checkpoint_timestamp_ms
    )
  }

  return Array.from(positions.values())
}

function getExposureRows(
  input: RiskInput,
  spotByOracleId: Map<string, number>
) {
  const oracleById = getOracleMap(input.oracles)
  const directionalRows = reconstructDirectionalExposures(input).flatMap(
    (position): RiskExposureRow[] => {
      const openQuantity = Math.max(
        position.quantityMinted - position.quantityRedeemed,
        0
      )
      const spot = spotByOracleId.get(position.oracleId)

      if (openQuantity <= 0 || spot === undefined) {
        return []
      }

      const strikePriceUsd = toUsdPrice(position.strike)
      const openQuantityUsd = toQuoteAmount(openQuantity)
      const sideLabel = position.isUp ? "Up" : "Down"

      return [
        {
          assetSymbol: getAssetSymbol(oracleById, position.oracleId),
          costBasisUsd: toQuoteAmount(
            getOpenCostBasis(
              position.cost,
              position.quantityMinted,
              openQuantity
            )
          ),
          expiryMs: position.expiryMs,
          id: `${position.oracleId}:${position.expiryMs}:${position.strike}:${position.isUp}`,
          kind: "directional",
          maxPayoutUsd: openQuantityUsd,
          openQuantity: openQuantityUsd,
          oracleId: position.oracleId,
          payoutEstimateUsd: getDirectionalPayout(position, spot, openQuantity),
          settlementLabel: `${sideLabel} ${strikePriceUsd.toLocaleString(
            "en-US",
            {
              maximumFractionDigits: 0,
              style: "currency",
              currency: "USD",
            }
          )}`,
        },
      ]
    }
  )
  const rangeRows = reconstructRangeExposures(input).flatMap(
    (position): RiskExposureRow[] => {
      const openQuantity = Math.max(
        position.quantityMinted - position.quantityRedeemed,
        0
      )
      const spot = spotByOracleId.get(position.oracleId)

      if (openQuantity <= 0 || spot === undefined) {
        return []
      }

      const lowerStrikePriceUsd = toUsdPrice(position.lowerStrike)
      const higherStrikePriceUsd = toUsdPrice(position.higherStrike)
      const openQuantityUsd = toQuoteAmount(openQuantity)

      return [
        {
          assetSymbol: getAssetSymbol(oracleById, position.oracleId),
          costBasisUsd: toQuoteAmount(
            getOpenCostBasis(
              position.cost,
              position.quantityMinted,
              openQuantity
            )
          ),
          expiryMs: position.expiryMs,
          id: `${position.oracleId}:${position.expiryMs}:${position.lowerStrike}:${position.higherStrike}`,
          kind: "range",
          maxPayoutUsd: openQuantityUsd,
          openQuantity: openQuantityUsd,
          oracleId: position.oracleId,
          payoutEstimateUsd: getRangePayout(position, spot, openQuantity),
          settlementLabel: `${lowerStrikePriceUsd.toLocaleString("en-US", {
            maximumFractionDigits: 0,
            style: "currency",
            currency: "USD",
          })}-${higherStrikePriceUsd.toLocaleString("en-US", {
            maximumFractionDigits: 0,
            style: "currency",
            currency: "USD",
          })} Range`,
        },
      ]
    }
  )

  return [...directionalRows, ...rangeRows].sort(
    (firstExposure, secondExposure) =>
      secondExposure.maxPayoutUsd - firstExposure.maxPayoutUsd ||
      firstExposure.expiryMs - secondExposure.expiryMs ||
      firstExposure.assetSymbol.localeCompare(secondExposure.assetSymbol)
  )
}

function getScenarioLiability({
  exposureRows,
  input,
  shockPercent,
  spotByOracleId,
}: {
  exposureRows: RiskExposureRow[]
  input: RiskInput
  shockPercent: number
  spotByOracleId: Map<string, number>
}) {
  const directionalExposures = reconstructDirectionalExposures(input)
  const rangeExposures = reconstructRangeExposures(input)
  let liability = 0

  for (const exposure of directionalExposures) {
    const openQuantity = Math.max(
      exposure.quantityMinted - exposure.quantityRedeemed,
      0
    )
    const spot = spotByOracleId.get(exposure.oracleId)

    if (openQuantity <= 0 || spot === undefined) {
      continue
    }

    liability += getDirectionalPayout(
      exposure,
      spot * (1 + shockPercent),
      openQuantity
    )
  }

  for (const exposure of rangeExposures) {
    const openQuantity = Math.max(
      exposure.quantityMinted - exposure.quantityRedeemed,
      0
    )
    const spot = spotByOracleId.get(exposure.oracleId)

    if (openQuantity <= 0 || spot === undefined) {
      continue
    }

    liability += getRangePayout(
      exposure,
      spot * (1 + shockPercent),
      openQuantity
    )
  }

  const reconstructedMaxPayoutUsd = exposureRows.reduce(
    (total, exposure) => total + exposure.maxPayoutUsd,
    0
  )
  const unreconstructedAnchor = Math.max(
    toQuoteAmount(input.summary.total_max_payout) - reconstructedMaxPayoutUsd,
    0
  )
  const anchorWeight = Math.min(Math.abs(shockPercent) / 0.35, 1)

  return Math.min(
    toQuoteAmount(input.summary.total_max_payout),
    liability + unreconstructedAnchor * anchorWeight
  )
}

function getScenarioRows({
  exposureRows,
  input,
  spotByOracleId,
}: {
  exposureRows: RiskExposureRow[]
  input: RiskInput
  spotByOracleId: Map<string, number>
}) {
  const baselineSharePrice = input.summary.plp_share_price
  const baselineLiability = getScenarioLiability({
    exposureRows,
    input,
    shockPercent: 0,
    spotByOracleId,
  })

  return scenarioDefinitions.map((scenario): RiskScenarioRow => {
    const estimatedLiability = getScenarioLiability({
      exposureRows,
      input,
      shockPercent: scenario.shockPercent,
      spotByOracleId,
    })
    const liabilityDelta = Math.max(estimatedLiability - baselineLiability, 0)
    const estimatedVaultValue = Math.max(
      toQuoteAmount(input.summary.vault_value) - liabilityDelta,
      0
    )
    const estimatedSharePrice =
      input.summary.plp_total_supply > 0
        ? input.summary.vault_value === 0
          ? 0
          : (estimatedVaultValue / toQuoteAmount(input.summary.vault_value)) *
            baselineSharePrice
        : 0
    const drawdownPct =
      baselineSharePrice > 0
        ? Math.max(1 - estimatedSharePrice / baselineSharePrice, 0)
        : 0

    return {
      drawdownPct,
      estimatedDrawdownUsd: Math.max(
        toQuoteAmount(input.summary.vault_value) - estimatedVaultValue,
        0
      ),
      estimatedLiability,
      estimatedSettlementPriceUsd: getWeightedSettlementPrice(
        exposureRows,
        spotByOracleId,
        scenario.shockPercent
      ),
      estimatedSharePrice,
      estimatedVaultValue,
      id: scenario.id,
      label: scenario.label,
      shockPercent: scenario.shockPercent,
      sigmaLabel: scenario.sigmaLabel,
    }
  })
}

function getLatestUpdatedAtMs(input: RiskInput) {
  const timestamps = input.oracleStates.flatMap((oracleState) => [
    oracleState.state.latest_price?.checkpoint_timestamp_ms,
    oracleState.state.latest_svi?.checkpoint_timestamp_ms,
  ])
  const numericTimestamps = timestamps.filter(
    (timestamp): timestamp is number => typeof timestamp === "number"
  )

  return numericTimestamps.length > 0
    ? Math.max(...numericTimestamps)
    : Date.now()
}

export function buildRiskModel(input: RiskInput): RiskModel {
  const spotByOracleId = getLatestSpotByOracle(input)
  const exposureRows = getExposureRows(input, spotByOracleId)
  const reconstructedMaxPayoutUsd = exposureRows.reduce(
    (total, exposure) => total + exposure.maxPayoutUsd,
    0
  )
  const summaryMaxPayoutUsd = toQuoteAmount(input.summary.total_max_payout)
  const hasIncompleteReconstruction =
    summaryMaxPayoutUsd > 0 &&
    reconstructedMaxPayoutUsd < summaryMaxPayoutUsd * 0.98

  return {
    assumptions: [
      "Scenario outputs are estimates from public Predict data and are not protocol-authoritative accounting.",
      "Scenario bands use configurable percentage shocks around the latest public oracle spot when exact sigma is unavailable.",
      "Exposure is reconstructed from recent mint, redeem, and range events; event limits can omit older activity.",
      "When event reconstruction is incomplete, total max payout is used as a conservative stress anchor.",
      "Current withdrawable liquidity reflects the latest public vault summary and is not a future-outcome commitment.",
    ],
    availableWithdrawalPct:
      input.summary.vault_value > 0
        ? input.summary.available_withdrawal / input.summary.vault_value
        : 0,
    baselineSharePrice: input.summary.plp_share_price,
    exposureRows,
    hasIncompleteReconstruction,
    latestUpdatedAtMs: getLatestUpdatedAtMs(input),
    reconstructedMaxPayoutUsd,
    scenarioRows: getScenarioRows({ exposureRows, input, spotByOracleId }),
    summary: input.summary,
  }
}

export function buildRiskReport(model: RiskModel): RiskReport {
  return {
    assumptions: model.assumptions,
    exposureRows: model.exposureRows,
    generatedAt: new Date().toISOString(),
    scenarioRows: model.scenarioRows,
    summary: model.summary,
  }
}
