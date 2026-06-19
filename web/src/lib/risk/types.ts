import type {
  DirectionalPositionMintEvent,
  DirectionalPositionRedeemEvent,
  OracleInfo,
  OracleStateResponse,
  RangeMintEvent,
  RangeRedeemEvent,
  VaultSummary,
} from "@/lib/types/predict"

export type RiskScenarioId =
  | "minus-5-sigma"
  | "minus-3-sigma"
  | "minus-1-sigma"
  | "current"
  | "plus-1-sigma"
  | "plus-3-sigma"
  | "plus-5-sigma"

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
  id: RiskScenarioId
  label: string
  shockPercent: number
  sigmaLabel: string
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
  drawdownPct: number
  estimatedDrawdownUsd: number
  estimatedLiability: number
  estimatedSettlementPriceUsd: number
  estimatedSharePrice: number
  estimatedVaultValue: number
  id: RiskScenarioId
  label: string
  shockPercent: number
  sigmaLabel: string
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
