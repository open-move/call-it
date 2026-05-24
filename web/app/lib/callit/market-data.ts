import {
  PredictionMarketKind,
  PredictionOutcome,
  type MarketTradeEvent,
  type PredictionMarketCardData,
} from "./types"

const directionalOutcomes = [
  { label: "Up", value: PredictionOutcome.Up },
  { label: "Down", value: PredictionOutcome.Down },
] satisfies PredictionMarketCardData["outcomes"]

const mockNowMs = Date.now()

function createRecentTrades(seed: number): MarketTradeEvent[] {
  return [
    {
      type: "mint",
      checkpoint_timestamp_ms: mockNowMs - 12_000,
      trader: `0x${seed}a7c`,
      is_up: true,
      quantity: 240,
      cost: 240,
      ask_price: 54,
    },
    {
      type: "redeem",
      checkpoint_timestamp_ms: mockNowMs - 31_000,
      owner: `0x${seed}d91`,
      is_up: false,
      quantity: 80,
      payout: 80,
      bid_price: 51,
      is_settled: false,
    },
    {
      type: "mint",
      checkpoint_timestamp_ms: mockNowMs - 74_000,
      trader: `0x${seed}f42`,
      is_up: false,
      quantity: 150,
      cost: 150,
      ask_price: 49,
    },
    {
      type: "mint",
      checkpoint_timestamp_ms: mockNowMs - 138_000,
      trader: `0x${seed}b33`,
      is_up: true,
      quantity: 90,
      cost: 90,
      ask_price: 53,
    },
  ]
}

const btcPriceHistory = [
  { label: "5m", valueUsd: 103_910 },
  { label: "4m", valueUsd: 104_060 },
  { label: "3m", valueUsd: 103_980 },
  { label: "2m", valueUsd: 104_220 },
  { label: "1m", valueUsd: 104_180 },
  { label: "Now", valueUsd: 104_280 },
]

const ethPriceHistory = [
  { label: "5m", valueUsd: 3_525 },
  { label: "4m", valueUsd: 3_519 },
  { label: "3m", valueUsd: 3_534 },
  { label: "2m", valueUsd: 3_542 },
  { label: "1m", valueUsd: 3_537 },
  { label: "Now", valueUsd: 3_548 },
]

const solPriceHistory = [
  { label: "5m", valueUsd: 174.2 },
  { label: "4m", valueUsd: 175.1 },
  { label: "3m", valueUsd: 176.4 },
  { label: "2m", valueUsd: 175.8 },
  { label: "1m", valueUsd: 177.6 },
  { label: "Now", valueUsd: 178.1 },
]

const suiPriceHistory = [
  { label: "5m", valueUsd: 3.72 },
  { label: "4m", valueUsd: 3.7 },
  { label: "3m", valueUsd: 3.74 },
  { label: "2m", valueUsd: 3.71 },
  { label: "1m", valueUsd: 3.69 },
  { label: "Now", valueUsd: 3.68 },
]

const dogePriceHistory = [
  { label: "5m", valueUsd: 0.192 },
  { label: "4m", valueUsd: 0.195 },
  { label: "3m", valueUsd: 0.193 },
  { label: "2m", valueUsd: 0.197 },
  { label: "1m", valueUsd: 0.199 },
  { label: "Now", valueUsd: 0.198 },
]

const bnbPriceHistory = [
  { label: "5m", valueUsd: 694.2 },
  { label: "4m", valueUsd: 692.9 },
  { label: "3m", valueUsd: 695.4 },
  { label: "2m", valueUsd: 696.1 },
  { label: "1m", valueUsd: 695.8 },
  { label: "Now", valueUsd: 697.3 },
]

export const cryptoPredictionMarkets: PredictionMarketCardData[] = [
  {
    id: "btc-up-down-5m",
    assetSymbol: "BTC",
    assetName: "Bitcoin",
    assetIconUrl: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png",
    prompt: "Up or Down in 5 minutes?",
    volumeUsd: 42_100,
    durationLabel: "5m",
    primaryOutcomePercent: 54,
    currentPriceUsd: 104_280,
    priceChangePercent: 0.36,
    tradeCount: 128,
    statusLabel: "Active",
    priceUpdatedLabel: "12s ago",
    priceHistory: btcPriceHistory,
    recentTrades: createRecentTrades(1),
    kind: PredictionMarketKind.Directional,
    outcomes: directionalOutcomes,
  },
  {
    id: "eth-up-down-5m",
    assetSymbol: "ETH",
    assetName: "Ethereum",
    assetIconUrl: "https://assets.coingecko.com/coins/images/279/standard/ethereum.png",
    prompt: "Up or Down in 5 minutes?",
    volumeUsd: 31_600,
    durationLabel: "5m",
    primaryOutcomePercent: 49,
    currentPriceUsd: 3_548,
    priceChangePercent: 0.65,
    tradeCount: 96,
    statusLabel: "Active",
    priceUpdatedLabel: "10s ago",
    priceHistory: ethPriceHistory,
    recentTrades: createRecentTrades(2),
    kind: PredictionMarketKind.Directional,
    outcomes: directionalOutcomes,
  },
  {
    id: "sol-up-down-5m",
    assetSymbol: "SOL",
    assetName: "Solana",
    assetIconUrl: "https://assets.coingecko.com/coins/images/4128/standard/solana.png",
    prompt: "Up or Down in 5 minutes?",
    volumeUsd: 18_900,
    durationLabel: "5m",
    primaryOutcomePercent: 61,
    currentPriceUsd: 178.1,
    priceChangePercent: 2.24,
    tradeCount: 74,
    statusLabel: "Active",
    priceUpdatedLabel: "9s ago",
    priceHistory: solPriceHistory,
    recentTrades: createRecentTrades(3),
    kind: PredictionMarketKind.Directional,
    outcomes: directionalOutcomes,
  },
  {
    id: "sui-up-down-5m",
    assetSymbol: "SUI",
    assetName: "Sui",
    assetIconUrl:
      "https://assets.coingecko.com/coins/images/26375/standard/sui-ocean-square.png",
    prompt: "Up or Down in 5 minutes?",
    volumeUsd: 12_400,
    durationLabel: "5m",
    primaryOutcomePercent: 46,
    currentPriceUsd: 3.68,
    priceChangePercent: -1.08,
    tradeCount: 51,
    statusLabel: "Active",
    priceUpdatedLabel: "15s ago",
    priceHistory: suiPriceHistory,
    recentTrades: createRecentTrades(4),
    kind: PredictionMarketKind.Directional,
    outcomes: directionalOutcomes,
  },
  {
    id: "doge-up-down-5m",
    assetSymbol: "DOGE",
    assetName: "Dogecoin",
    assetIconUrl: "https://assets.coingecko.com/coins/images/5/standard/dogecoin.png",
    prompt: "Up or Down in 5 minutes?",
    volumeUsd: 9_800,
    durationLabel: "5m",
    primaryOutcomePercent: 58,
    currentPriceUsd: 0.198,
    priceChangePercent: 3.13,
    tradeCount: 43,
    statusLabel: "Active",
    priceUpdatedLabel: "14s ago",
    priceHistory: dogePriceHistory,
    recentTrades: createRecentTrades(5),
    kind: PredictionMarketKind.Directional,
    outcomes: directionalOutcomes,
  },
  {
    id: "bnb-up-down-5m",
    assetSymbol: "BNB",
    assetName: "BNB",
    assetIconUrl:
      "https://assets.coingecko.com/coins/images/825/standard/bnb-icon2_2x.png",
    prompt: "Up or Down in 5 minutes?",
    volumeUsd: 7_200,
    durationLabel: "5m",
    primaryOutcomePercent: 52,
    currentPriceUsd: 697.3,
    priceChangePercent: 0.45,
    tradeCount: 39,
    statusLabel: "Active",
    priceUpdatedLabel: "11s ago",
    priceHistory: bnbPriceHistory,
    recentTrades: createRecentTrades(6),
    kind: PredictionMarketKind.Directional,
    outcomes: directionalOutcomes,
  },
]

export function getCryptoPredictionMarket(marketId: string) {
  return cryptoPredictionMarkets.find((market) => market.id === marketId)
}
