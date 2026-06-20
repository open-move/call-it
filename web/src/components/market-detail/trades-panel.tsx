import {
  formatCompactDusdc,
  formatPriceCents,
  formatQuantity,
  formatRelativeTime,
  getActivityTradeContract,
} from "@/lib/market-detail/helpers"
import type { TradeActivityRow } from "@/lib/types/trade"
import { ActivityTransactionLink } from "@/components/shared/activity/activity-table"

import { ActivityHeaderRow } from "./activity-header-row"
import { ContractKindTag } from "./contract-kind-tag"
import { EmptyState } from "./empty-state"

export function TradesPanel({
  assetSymbol,
  trades,
  walletAddress,
}: {
  assetSymbol: string
  trades: TradeActivityRow[]
  walletAddress?: string
}) {
  if (!walletAddress) {
    return <EmptyState message="Connect wallet to view your fills." />
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      {trades.length > 0 ? (
        <TradesTable assetSymbol={assetSymbol} trades={trades} />
      ) : (
        <EmptyState message="No fills for this market from your wallet." />
      )}
    </div>
  )
}

function TradesTable({
  assetSymbol,
  trades,
}: {
  assetSymbol: string
  trades: TradeActivityRow[]
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="min-w-[54rem]">
        <ActivityHeaderRow
          className="grid-cols-[minmax(13rem,1.9fr)_5.25rem_6rem_6.5rem_5rem_5.5rem]"
          columns={["Contract", "Price", "Contracts", "Premium", "Tx", "Time"]}
        />
        {trades.map((trade) => (
          <div
            className="grid grid-cols-[minmax(13rem,1.9fr)_5.25rem_6rem_6.5rem_5rem_5.5rem] gap-4 border-b border-border/35 px-3 py-2 text-xs"
            key={trade.id}
          >
            <div className="flex min-w-0 items-center gap-2">
              <ContractKindTag row={trade} />
              <span className="truncate font-medium text-foreground">
                {getActivityTradeContract(trade, assetSymbol)}
              </span>
            </div>
            <span className="font-mono tabular-nums">
              {formatPriceCents(trade.price)}
            </span>
            <span className="font-mono text-muted-foreground tabular-nums">
              {formatQuantity(trade.quantity)}
            </span>
            <span className="font-mono tabular-nums">
              {formatCompactDusdc(trade.costUsd)}
            </span>
            <ActivityTransactionLink
              transactionDigest={trade.transactionDigest}
            />
            <span className="text-right font-mono text-muted-foreground tabular-nums">
              {formatRelativeTime(trade.timestampMs)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
