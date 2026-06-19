import type {
  DirectionalPositionMintEvent,
  DirectionalPositionRedeemEvent,
  OracleInfo,
  OracleStateResponse,
  RangeMintEvent,
  RangeRedeemEvent,
  VaultSummary,
} from "@/lib/types/predict"

export type RiskScenarioId = string
export type RiskScenarioGroup = "core" | "downside" | "upside" | "stress"
export type RiskScenarioTone = "down" | "muted" | "up" | "warning"

export type RiskExposureKind = "directional" | "range"

export interface RiskOracleState {
  oracleId: string
  state: OracleStateResponse
}

export interface RiskInput {
  directionalMints: DirectionalPositionMintEvent[]
  directionalRedeems: DirectionalPositionRedeemEvent[]
  oracleStates: RiskOracleState[]
  oracles: OracleInfo[]
  rangeMints: RangeMintEvent[]
  rangeRedeems: RangeRedeemEvent[]
  summary: VaultSummary
}

export interface RiskScenarioDefinition {
  description: string
  fallbackShock: number
  group: RiskScenarioGroup
  id: RiskScenarioId
  label: string
  shocks: Record<string, number>
  stressMode?: "maxPayout"
  tone: RiskScenarioTone
}

export interface RiskExposureRow {
  assetSymbol: string
  costBasisUsd: number
  expiryMs: number
  id: string
  kind: RiskExposureKind
  maxPayoutUsd: number
  openQuantity: number
  oracleId: string
  payoutEstimateUsd: number
  settlementLabel: string
}

export interface RiskScenarioRow {
  description: string
  drawdownPct: number
  estimatedDrawdownUsd: number
  estimatedLiability: number
  estimatedSettlementPriceUsd: number
  estimatedSharePrice: number
  estimatedVaultValue: number
  fallbackShock: number
  group: RiskScenarioGroup
  id: RiskScenarioId
  label: string
  primaryShockPercent: number
  shockSummary: string
  tone: RiskScenarioTone
}

export interface RiskModel {
  assumptions: string[]
  availableWithdrawalPct: number
  baselineSharePrice: number
  exposureRows: RiskExposureRow[]
  hasIncompleteReconstruction: boolean
  latestUpdatedAtMs: number
  reconstructedMaxPayoutUsd: number
  scenarioRows: RiskScenarioRow[]
  summary: VaultSummary
}

export interface RiskReport {
  assumptions: string[]
  exposureRows: RiskExposureRow[]
  generatedAt: string
  scenarioRows: RiskScenarioRow[]
  summary: VaultSummary
}
