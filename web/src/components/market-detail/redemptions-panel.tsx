import {
  formatCompactDusdc,
  formatPriceCents,
  formatQuantity,
  getRedemptionContract,
} from "@/lib/market-detail/helpers"
import { formatRelativeTime } from "@/lib/format"
import type { RedemptionActivityRow } from "@/lib/types/trade"
import { ActivityTransactionLink } from "@/components/shared/activity/activity-table"

import { ActivityHeaderRow } from "./activity-header-row"
import { ContractKindTag } from "./contract-kind-tag"
import { EmptyState } from "./empty-state"

export function RedemptionsPanel({
  assetSymbol,
  redemptions,
  walletAddress,
}: {
  assetSymbol: string
  redemptions: RedemptionActivityRow[]
  walletAddress?: string
}) {
  if (!walletAddress) {
    return <EmptyState message="Connect wallet to view your redeem activity." />
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      {redemptions.length > 0 ? (
        <RedemptionsTable assetSymbol={assetSymbol} redemptions={redemptions} />
      ) : (
        <EmptyState message="No redeems for this market from your wallet." />
      )}
    </div>
  )
}

function RedemptionsTable({
  assetSymbol,
  redemptions,
}: {
  assetSymbol: string
  redemptions: RedemptionActivityRow[]
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="min-w-[54rem]">
        <ActivityHeaderRow
          className="grid-cols-[minmax(13rem,1.9fr)_5.25rem_6rem_6.5rem_5rem_5.5rem]"
          columns={["Contract", "Price", "Contracts", "Payout", "Tx", "Time"]}
        />
        {redemptions.map((redemption) => (
          <div
            className="grid grid-cols-[minmax(13rem,1.9fr)_5.25rem_6rem_6.5rem_5rem_5.5rem] gap-4 border-b border-border/35 px-3 py-2 text-xs"
            key={redemption.id}
          >
            <div className="flex min-w-0 items-center gap-2">
              <ContractKindTag row={redemption} />
              <span className="truncate font-medium text-foreground">
                {getRedemptionContract(redemption, assetSymbol)}
              </span>
            </div>
            <span className="font-mono tabular-nums">
              {formatPriceCents(redemption.bidPrice)}
            </span>
            <span className="font-mono text-muted-foreground tabular-nums">
              {formatQuantity(redemption.quantity)}
            </span>
            <span className="font-mono tabular-nums">
              {formatCompactDusdc(redemption.payoutUsd)}
            </span>
            <ActivityTransactionLink
              transactionDigest={redemption.transactionDigest}
            />
            <span className="text-right font-mono text-muted-foreground tabular-nums">
              {formatRelativeTime(redemption.timestampMs)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
