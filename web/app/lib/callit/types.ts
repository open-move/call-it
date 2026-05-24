export enum PredictionOutcome {
  Up = "up",
  Down = "down",
  Yes = "yes",
  No = "no",
}

export enum PredictionMarketKind {
  Directional = "directional",
  Question = "question",
}

export interface PredictionOutcomeOption {
  label: string
  value: PredictionOutcome
}

export interface PredictionMarketCardData {
  id: string
  assetSymbol: string
  assetName: string
  assetIconUrl: string
  prompt: string
  volumeUsd: number
  durationLabel: string
  primaryOutcomePercent: number
  kind: PredictionMarketKind
  outcomes: [PredictionOutcomeOption, PredictionOutcomeOption]
}
