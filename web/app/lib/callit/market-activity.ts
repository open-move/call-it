import { formatRelativeTime } from "./format"
import { type MarketTradeEvent, type PredictionOutcomeOption } from "./types"

export interface MarketActivityRow {
  id: string
  timeLabel: string
  actionLabel: string
  amountUsd: number
}

function getTradeActionLabel(trade: MarketTradeEvent) {
  return trade.type === "mint" ? "Bought" : "Sold"
}

function getTradeAmountUsd(trade: MarketTradeEvent) {
  return trade.type === "mint" ? trade.cost : trade.payout
}

export function getMarketActivityRows(
  trades: MarketTradeEvent[],
  outcomes: [PredictionOutcomeOption, PredictionOutcomeOption]
): MarketActivityRow[] {
  return trades.map((trade) => {
    const outcomeLabel = trade.is_up ? outcomes[0].label : outcomes[1].label

    return {
      id: `${trade.type}-${trade.checkpoint_timestamp_ms}-${trade.quantity}`,
      timeLabel: formatRelativeTime(trade.checkpoint_timestamp_ms),
      actionLabel: `${getTradeActionLabel(trade)} ${outcomeLabel}`,
      amountUsd: getTradeAmountUsd(trade),
    }
  })
}
