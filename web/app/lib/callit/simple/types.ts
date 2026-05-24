import { type MarketSnapshot, type MarketTradeEvent } from "../market/types"

export enum PredictionOutcome {
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

export interface SimpleMarket extends MarketSnapshot {
  durationLabel: string
  expiryLabel: string
  kind: PredictionMarketKind
  outcomes: [PredictionOutcomeOption, PredictionOutcomeOption]
  priceUpdatedLabel: string
  primaryOutcomePercent?: number
  prompt: string
  recentTrades: MarketTradeEvent[]
  statusLabel: string
}
