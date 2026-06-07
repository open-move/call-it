import { computeFairUpProbability } from "@/lib/callit/market/svi"
import { type MarketSnapshot } from "@/lib/callit/market/types"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/deepbook/config"
import { quotePredictTradeSafe } from "@/lib/deepbook/predict-quotes"

const QUOTE_SENDER = "0x797"
const QUOTE_QUANTITY = 10n ** BigInt(PREDICT_QUOTE_DECIMALS)
const SAFE_MIN_FAIR_UP = 0.05
const SAFE_MAX_FAIR_UP = 0.95
const CANDIDATE_OFFSETS = [
  0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -8, 8, -10, 10,
] as const

function getCoarseStrikeStepUsd(currentPriceUsd: number) {
  if (currentPriceUsd >= 50_000) {
    return 100
  }

  if (currentPriceUsd >= 10_000) {
    return 50
  }

  if (currentPriceUsd >= 1_000) {
    return 25
  }

  if (currentPriceUsd >= 100) {
    return 5
  }

  if (currentPriceUsd >= 10) {
    return 1
  }

  return 0.1
}

function getStrikeStepUsd(snapshot: MarketSnapshot) {
  const coarseStep = getCoarseStrikeStepUsd(snapshot.currentPriceUsd)

  if (snapshot.tickSizeUsd <= 0) {
    return coarseStep
  }

  return Math.max(
    snapshot.tickSizeUsd,
    Math.ceil(coarseStep / snapshot.tickSizeUsd) * snapshot.tickSizeUsd
  )
}

export function normalizeTradeStrike(value: number, snapshot: MarketSnapshot) {
  const tickSizeUsd = snapshot.tickSizeUsd > 0 ? snapshot.tickSizeUsd : 1
  const minStrikeUsd = snapshot.minStrikeUsd
  const maxStrikeUsd = snapshot.maxStrikeUsd
  const ticksFromMinimum = Math.round((value - minStrikeUsd) / tickSizeUsd)
  const normalizedValue = minStrikeUsd + ticksFromMinimum * tickSizeUsd
  const boundedValue = Math.min(
    Math.max(normalizedValue, minStrikeUsd),
    maxStrikeUsd
  )

  return Number(boundedValue.toFixed(8))
}

function getStableStrikeAnchor(snapshot: MarketSnapshot) {
  const anchorSource = snapshot.forwardPriceUsd || snapshot.currentPriceUsd
  const step = getStrikeStepUsd(snapshot)
  const coarseAnchor = Math.round(anchorSource / step) * step

  return normalizeTradeStrike(coarseAnchor, snapshot)
}

function getFairUpProbability(
  snapshot: MarketSnapshot,
  strikePriceUsd: number
) {
  return computeFairUpProbability({
    forward: snapshot.forwardPriceUsd,
    strike: strikePriceUsd,
    svi: snapshot.latestSvi,
  })
}

function isFairProbabilitySafe(value: number | undefined) {
  return (
    value === undefined ||
    (value >= SAFE_MIN_FAIR_UP && value <= SAFE_MAX_FAIR_UP)
  )
}

export function getStableTradeStrikeCandidates(snapshot: MarketSnapshot) {
  const anchor = getStableStrikeAnchor(snapshot)
  const step = getStrikeStepUsd(snapshot)
  const seenStrikes = new Set<number>()
  const candidates: number[] = []

  for (const offset of CANDIDATE_OFFSETS) {
    const strike = normalizeTradeStrike(anchor + offset * step, snapshot)

    if (seenStrikes.has(strike)) {
      continue
    }

    seenStrikes.add(strike)

    if (isFairProbabilitySafe(getFairUpProbability(snapshot, strike))) {
      candidates.push(strike)
    }
  }

  if (candidates.length > 0) {
    return candidates
  }

  return [anchor]
}

export function getStableTradeStrike(snapshot: MarketSnapshot) {
  return getStableTradeStrikeCandidates(snapshot)[0] ?? snapshot.strikePriceUsd
}

export async function getQuoteableTradeStrike(snapshot: MarketSnapshot) {
  for (const strikePriceUsd of getStableTradeStrikeCandidates(snapshot)) {
    const quote = await quotePredictTradeSafe({
      expiryMs: snapshot.expiryMs,
      isUp: true,
      kind: "binary",
      oracleId: snapshot.oracleId,
      quantity: QUOTE_QUANTITY,
      strikePriceUsd,
      walletAddress: QUOTE_SENDER,
    })

    if (quote.status === "quoted") {
      return strikePriceUsd
    }
  }

  return getStableTradeStrike(snapshot)
}
