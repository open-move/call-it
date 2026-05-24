export interface MarketPricePoint {
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

export interface MarketSnapshot {
  id: string
  oracleId: string
  assetSymbol: string
  assetName: string
  assetIconUrl?: string
  currentPriceUsd: number
  expiryMs: number
  minStrikeUsd: number
  priceChangePercent: number
  priceHistory: MarketPricePoint[]
  priceUpdatedMs: number
  recentTrades: MarketTradeEvent[]
  status: string
  strikePriceUsd: number
  tickSizeUsd: number
  volumeUsd?: number
  tradeCount?: number
}
