import type { OracleSviUpdate } from "@/lib/types/predict"

export interface MarketPricePoint {
  timestampMs: number
  valueUsd: number
}

export interface ExpiryOption {
  assetSymbol: string
  expiryMs: number
  oracleId: string
  status: string
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

export interface MarketSnapshot {
  id: string
  oracleId: string
  assetSymbol: string
  assetName: string
  assetIconUrl?: string
  currentPriceUsd: number
  expiryMs: number
  fairUpProbability?: number
  forwardPriceUsd: number
  latestSvi: OracleSviUpdate | null
  maxStrikeUsd: number
  minStrikeUsd: number
  priceChangePercent: number
  priceHistory: MarketPricePoint[]
  priceUpdatedMs: number
  recentTrades: MarketTradeEvent[]
  settledAtMs: number | null
  settlementPrice: number | null
  status: string
  strikePriceUsd: number
  tickSizeUsd: number
  volumeUsd?: number
  tradeCount?: number
}
