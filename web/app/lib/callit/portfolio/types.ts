export enum PortfolioPositionStatus {
  Active = "active",
  Redeemable = "redeemable",
  Settled = "settled",
}

export enum PortfolioPositionKind {
  Binary = "binary",
  Range = "range",
  Liquidity = "liquidity",
}

export interface PortfolioSummary {
  activePositions: number
  claimableAmountUsd: number
  managerBalanceUsd: number
  realizedPnlUsd: number
}

export interface PortfolioPosition {
  id: string
  assetSymbol: string
  entryPriceLabel: string
  expiryLabel: string
  kind: PortfolioPositionKind
  outcomeLabel: string
  pnlLabel?: string
  quantityLabel: string
  settlementLabel: string
  status: PortfolioPositionStatus
  valueLabel: string
}

export interface PortfolioActivityItem {
  id: string
  actionLabel: string
  amountLabel: string
  assetSymbol: string
  detailLabel: string
  timeLabel: string
}

export interface PortfolioPageData {
  activity: PortfolioActivityItem[]
  positions: PortfolioPosition[]
  summary: PortfolioSummary
}
