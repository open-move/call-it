export interface ProMarket {
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
  ladderOffset: number
}

export interface ProToolbarQuote {
  aboveAsk: number
  aboveBid: number
  spread: number
}

export interface ProTrade {
  id: string
  trader: string
  timestampMs: number
  strikePriceUsd: number
  side: "above" | "below"
  price: number
  quantity: number
  costUsd: number
}

export interface ProRedemption {
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

export interface ProPosition {
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

export interface ProRangeTrade {
  id: string
  trader: string
  timestampMs: number
  lowerStrikePriceUsd: number
  higherStrikePriceUsd: number
  price: number
  quantity: number
  costUsd: number
}

export interface ProRangeRedemption {
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
