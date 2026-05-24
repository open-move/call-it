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
