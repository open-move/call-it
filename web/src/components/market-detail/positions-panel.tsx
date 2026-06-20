import { Button } from "@/components/ui/button"
import { PositionTable } from "@/components/shared/activity/position-table"
import type { PositionTableRow } from "@/components/shared/activity/position-table"
import { formatRelativeTime } from "@/lib/format"
import {
  canAddToPosition,
  canClearPosition,
  canClosePosition,
  canRedeemPosition,
  formatPositionQuantity,
  getPositionAddIntent,
  getPositionContract,
  getPositionKindLabel,
  getPositionLifecycleActionLabel,
} from "@/lib/market-detail/helpers"
import type { AddPositionIntent } from "@/lib/market-detail/types"
import type { PositionRow } from "@/lib/types/trade"
import {
  ActivityTableHeader,
  ActivityTransactionLink,
} from "@/components/shared/activity/activity-table"

import { EmptyState } from "./empty-state"

export interface PositionsPanelProps {
  assetSymbol: string
  errorMessage?: string
  isLoading: boolean
  onAddPosition: (intent: AddPositionIntent) => void
  onCancelLifecycle: () => void
  onConfirmLifecycle: (position: PositionRow) => void
  onRequestLifecycle: (position: PositionRow) => void
  pendingLifecyclePosition?: PositionRow
  positions: PositionRow[]
  previewErrorMessage?: string
  previewIsExecuting?: boolean
  previewIsLoading: boolean
  previewMessage?: string
  walletAddress?: string
}

export function PositionsPanel({
  assetSymbol,
  errorMessage,
  isLoading,
  onAddPosition,
  onCancelLifecycle,
  onConfirmLifecycle,
  onRequestLifecycle,
  pendingLifecyclePosition,
  positions,
  previewErrorMessage,
  previewIsExecuting,
  previewIsLoading,
  previewMessage,
  walletAddress,
}: PositionsPanelProps) {
  if (!walletAddress) {
    return <EmptyState message="Connect wallet to view your positions." />
  }

  if (errorMessage) {
    return <EmptyState message={errorMessage} />
  }

  const emptyMessage = isLoading
    ? "Loading positions."
    : "No open positions for this market."

  return (
    <div className="flex h-full min-h-0 flex-col">
      {pendingLifecyclePosition && (
        <LifecycleConfirmBanner
          assetSymbol={assetSymbol}
          onCancel={onCancelLifecycle}
          onConfirm={() => onConfirmLifecycle(pendingLifecyclePosition)}
          position={pendingLifecyclePosition}
        />
      )}
      {(previewErrorMessage || previewIsLoading || previewMessage) && (
        <p
          className={
            previewErrorMessage
              ? "mb-2 shrink-0 rounded-md bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
              : "mb-2 shrink-0 rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground"
          }
        >
          {previewErrorMessage ??
            (previewIsLoading
              ? previewIsExecuting
                ? "Preparing lifecycle action."
                : "Previewing lifecycle action."
              : previewMessage)}
        </p>
      )}
      {positions.length > 0 ? (
        <PositionTable
          emptyMessage="No open positions for this market."
          loadingMessage="Loading positions."
          rows={getPositionTableRows({
            assetSymbol,
            onAddPosition,
            onRequestLifecycle,
            positions,
          })}
        />
      ) : (
        <EmptyState message={emptyMessage} />
      )}
    </div>
  )
}

function LifecycleConfirmBanner({
  assetSymbol,
  onCancel,
  onConfirm,
  position,
}: {
  assetSymbol: string
  onCancel: () => void
  onConfirm: () => void
  position: PositionRow
}) {
  const actionLabel = getPositionLifecycleActionLabel(position)

  return (
    <div className="mb-2 flex shrink-0 flex-col gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-primary sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="font-medium">Confirm {actionLabel.toLowerCase()}</div>
        <div className="truncate text-[10px] text-primary/80">
          {getPositionContract(position, assetSymbol)} ·{" "}
          {formatPositionQuantity(position.openQuantity)} contracts
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="xs" type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" type="button" onClick={onConfirm}>
          Confirm
        </Button>
      </div>
    </div>
  )
}

function getPositionTableRows({
  assetSymbol,
  onAddPosition,
  onRequestLifecycle,
  positions,
}: {
  assetSymbol: string
  onAddPosition: (intent: AddPositionIntent) => void
  onRequestLifecycle: (position: PositionRow) => void
  positions: PositionRow[]
}): PositionTableRow[] {
  return positions.map((position) => {
    const pnl =
      position.unrealizedPnlUsd !== null
        ? position.unrealizedPnlUsd + position.realizedPnlUsd
        : null
    const lifecycleActionLabel = getPositionLifecycleActionLabel(position)
    const showLifecycleAction =
      canClosePosition(position) ||
      canRedeemPosition(position) ||
      canClearPosition(position)

    return {
      actions: [
        ...(canAddToPosition(position)
          ? [
              {
                label: "Add to position",
                onSelect: () => onAddPosition(getPositionAddIntent(position)),
              },
            ]
          : []),
        ...(showLifecycleAction
          ? [
              {
                label: lifecycleActionLabel,
                onSelect: () => onRequestLifecycle(position),
              },
            ]
          : []),
      ],
      averageEntryPrice: position.averageEntryPrice,
      contractLabel: getPositionContract(position, assetSymbol),
      id: position.id,
      meta: `${position.status} · ${formatRelativeTime(position.lastActivityAt)}`,
      pnlUsd: pnl,
      premiumUsd: position.openCostBasisUsd,
      quantity: position.openQuantity,
      tag: getPositionKindLabel(position),
      tone:
        position.kind === "range"
          ? "range"
          : position.side === "above"
            ? "up"
            : "down",
      valueUnavailable: position.markValueUsd === null,
    }
  })
}
