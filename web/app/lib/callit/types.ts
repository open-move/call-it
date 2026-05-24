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

export interface MarketPricePoint {
  label: string
  timestampMs: number
  valueUsd: number
}

export type MarketTradeEvent =
  | {
      type: "mint"
      checkpoint_timestamp_ms: number
      trader: string
      is_up: boolean
      quantity: number
      cost: number
      ask_price: number
    }
  | {
      type: "redeem"
      checkpoint_timestamp_ms: number
      owner: string
      is_up: boolean
      quantity: number
      payout: number
      bid_price: number
      is_settled: boolean
    }

export interface PredictionMarketCardData {
  id: string
  oracleId: string
  assetSymbol: string
  assetName: string
  assetIconUrl?: string
  prompt: string
  volumeUsd?: number
  durationLabel: string
  primaryOutcomePercent?: number
  currentPriceUsd: number
  priceChangePercent: number
  tradeCount?: number
  statusLabel: string
  priceUpdatedLabel: string
  expiryMs: number
  expiryLabel: string
  strikePriceUsd: number
  priceHistory: MarketPricePoint[]
  recentTrades: MarketTradeEvent[]
  kind: PredictionMarketKind
  outcomes: [PredictionOutcomeOption, PredictionOutcomeOption]
}
