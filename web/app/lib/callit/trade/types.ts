export interface TradeMarket {
  id: string
  oracleId: string
  assetSymbol: string
  assetName: string
  assetIconUrl?: string
  currentPriceUsd: number
  expiryMs: number
  priceUpdatedMs: number
  status: string
  strikePriceUsd: number
}

export interface ToolbarQuote {
  aboveAsk: number
  aboveBid: number
  spread: number
}

export interface Trade {
  id: string
  trader: string
  timestampMs: number
  strikePriceUsd: number
  side: "above" | "below"
  price: number
  quantity: number
  costUsd: number
}

export interface Redemption {
  id: string
  owner: string
  executor: string
  timestampMs: number
  strikePriceUsd: number
  side: "above" | "below"
  bidPrice: number
  quantity: number
  payoutUsd: number
  isSettled: boolean
}

export interface Position {
  id: string
  strikePriceUsd: number
  side: "above" | "below"
  openQuantity: number
  averageEntryPrice: number | null
  markPrice: number | null
  openCostBasisUsd: number
  markValueUsd: number | null
  realizedPnlUsd: number
  unrealizedPnlUsd: number
  status: string
  lastActivityAt: number
}

export interface RangeTrade {
  id: string
  trader: string
  timestampMs: number
  lowerStrikePriceUsd: number
  higherStrikePriceUsd: number
  price: number
  quantity: number
  costUsd: number
}

export interface RangeRedemption {
  id: string
  trader: string
  timestampMs: number
  lowerStrikePriceUsd: number
  higherStrikePriceUsd: number
  bidPrice: number
  quantity: number
  payoutUsd: number
  isSettled: boolean
}
