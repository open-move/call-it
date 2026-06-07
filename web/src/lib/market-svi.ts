import { PREDICT_PRICE_SCALE as FLOAT_SCALE } from "@/lib/config"
import type {OracleSviUpdate} from "@/lib/types/predict";

export interface FairUpProbabilityOptions {
  forward: number
  strike: number
  svi: OracleSviUpdate | null
}

function clampProbability(value: number) {
  return Math.min(Math.max(value, 0), 1)
}

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value) / Math.sqrt(2)
  const t = 1 / (1 + 0.3275911 * x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const erf =
    sign *
    (1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x))

  return 0.5 * (1 + erf)
}

function toScaledSignedValue(value: number, isNegative: boolean) {
  const scaledValue = value / FLOAT_SCALE

  return isNegative ? -scaledValue : scaledValue
}

export function computeFairUpProbability({
  forward,
  strike,
  svi,
}: FairUpProbabilityOptions) {
  if (!svi || forward <= 0 || strike <= 0) {
    return undefined
  }

  const k = Math.log(strike / forward)
  const a = svi.a / FLOAT_SCALE
  const b = svi.b / FLOAT_SCALE
  const rho = toScaledSignedValue(svi.rho, svi.rho_negative)
  const m = toScaledSignedValue(svi.m, svi.m_negative)
  const sigma = svi.sigma / FLOAT_SCALE
  const kMinusM = k - m
  const totalVariance =
    a + b * (rho * kMinusM + Math.sqrt(kMinusM * kMinusM + sigma * sigma))

  if (!Number.isFinite(totalVariance) || totalVariance <= 0) {
    return undefined
  }

  const sqrtVariance = Math.sqrt(totalVariance)
  const d2 = -((k + totalVariance / 2) / sqrtVariance)
  const probability = normalCdf(d2)

  return Number.isFinite(probability)
    ? clampProbability(probability)
    : undefined
}
