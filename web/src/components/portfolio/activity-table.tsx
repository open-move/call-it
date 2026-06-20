import {
  ActivityEmptyState,
  ActivityNotice,
  ActivityTableHeader,
} from "@/components/shared/activity/activity-table"
import { Input } from "@/components/ui/input"
import { formatExpiryDistance, formatRelativeTime } from "@/lib/format"
import {
  formatDusdc,
  formatQuantity,
  formatSignedDusdc,
} from "@/lib/portfolio/format"
import {
  type PortfolioPosition,
  type PortfolioTab,
  getPnlClassName,
  getPositionTypeClassName,
} from "@/lib/portfolio/helpers"
import {
  canAddToPortfolioPosition,
  canLifecyclePortfolioPosition,
  getPortfolioMarketUrl,
  getPositionLifecycleActionLabel,
  getPortfolioPositionTone,
} from "@/lib/portfolio/helpers"
import type { PositionTableRow } from "@/components/shared/activity/position-table"
import { cn } from "@/lib/utils"

function PositionTypeTag({ position }: { position: PortfolioPosition }) {
  return (
    <span
      className={cn(
        "inline-flex w-9 shrink-0 font-mono text-[10px] tracking-wide uppercase",
        getPositionTypeClassName(position.type)
      )}
    >
      {position.type}
    </span>
  )
}

function ReservationBadge({ position }: { position: PortfolioPosition }) {
  if (!position.reservationLabel) {
    return null
  }

  return (
    <span className="shrink-0 rounded-sm border border-amber-500/25 bg-amber-500/5 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-amber-200/90 uppercase">
      {position.reservationLabel}
    </span>
  )
}

function PositionMarketCell({ position }: { position: PortfolioPosition }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <PositionTypeTag position={position} />
        <span className="truncate font-medium text-foreground">
          {position.contractLabel}
        </span>
      </div>
      <div className="mt-0.5 flex min-w-0 items-center gap-2">
        <div className="truncate font-mono text-[10px] text-muted-foreground uppercase">
          {position.status} · {formatExpiryDistance(position.expiryMs)} ·{" "}
          {formatRelativeTime(position.lastActivityAt)}
        </div>
        <ReservationBadge position={position} />
      </div>
    </div>
  )
}

function LedgerEmptyState({ message }: { message: string }) {
  return <ActivityEmptyState message={message} />
}

function MobileStat({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-md bg-background/35 px-2.5 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-mono text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}

export function getPortfolioPositionTableRows({
  onLifecyclePosition,
  positions,
  redeemingPositionId,
}: {
  onLifecyclePosition: (position: PortfolioPosition) => void
  positions: PortfolioPosition[]
  redeemingPositionId?: string
}): PositionTableRow[] {
  return positions.map((position) => {
    const isLifecyclePending = redeemingPositionId === position.id

    return {
      actions: [
        ...(canAddToPortfolioPosition(position)
          ? [
              {
                label: "Add to position",
                onSelect: () => {
                  window.location.assign(getPortfolioMarketUrl(position))
                },
              },
            ]
          : []),
        ...(canLifecyclePortfolioPosition(position)
          ? [
              {
                disabled: isLifecyclePending,
                label: isLifecyclePending
                  ? "Submitting..."
                  : getPositionLifecycleActionLabel(position),
                onSelect: () => onLifecyclePosition(position),
              },
            ]
          : []),
      ],
      averageEntryPrice: position.averageEntryPrice,
      badges: position.reservationLabel ? (
        <ReservationBadge position={position} />
      ) : undefined,
      contractLabel: position.contractLabel,
      id: position.id,
      meta: `${position.status} · ${formatExpiryDistance(position.expiryMs)} · ${formatRelativeTime(position.lastActivityAt)}`,
      pnlUsd:
        position.unrealizedPnlUsd === null
          ? null
          : position.unrealizedPnlUsd + position.realizedPnlUsd,
      premiumUsd: position.costBasisUsd,
      quantity: position.size,
      tag: position.type,
      tone: getPortfolioPositionTone(position),
      valueUnavailable: position.currentValueUsd === null,
    }
  })
}

function PortfolioHeaderRow({
  className,
  columns,
}: {
  className: string
  columns: Array<{ align?: "left" | "right"; label: string }>
}) {
  return <ActivityTableHeader columns={columns} gridClassName={className} />
}

export function ActivityTable({
  isLoading,
  positions,
}: {
  isLoading: boolean
  positions: PortfolioPosition[]
}) {
  if (isLoading) {
    return <LedgerEmptyState message="Loading portfolio activity." />
  }

  if (positions.length === 0) {
    return <LedgerEmptyState message="No recent portfolio activity." />
  }

  const hasUnavailableValues = positions.some(
    (position) => position.size > 0 && position.currentValueUsd === null
  )

  return (
    <>
      <div className="hidden h-full min-h-0 overflow-auto lg:block">
        <div className="min-w-[54rem]">
          {hasUnavailableValues ? (
            <ActivityNotice>
              Live exit values are unavailable. Entry and premium are shown from
              trade history.
            </ActivityNotice>
          ) : null}
          <PortfolioHeaderRow
            className="grid-cols-[minmax(13rem,1.9fr)_7rem_6.5rem_6.5rem_6rem_5.5rem]"
            columns={[
              { label: "Contract" },
              { label: "Contracts" },
              { align: "right", label: "Value" },
              { align: "right", label: "PnL" },
              { label: "Status" },
              { align: "right", label: "Time" },
            ]}
          />
          {positions.map((position) => (
            <div
              className="grid grid-cols-[minmax(13rem,1.9fr)_7rem_6.5rem_6.5rem_6rem_5.5rem] items-center gap-4 border-b border-border/35 px-3 py-2 text-xs last:border-b-0"
              key={position.id}
            >
              <PositionMarketCell position={position} />
              <span className="truncate font-mono text-muted-foreground tabular-nums">
                {formatQuantity(position.size)}
              </span>
              <span className="truncate text-right font-mono tabular-nums">
                {position.currentValueUsd === null
                  ? "--"
                  : formatDusdc(position.currentValueUsd)}
              </span>
              <span
                className={cn(
                  "truncate text-right font-mono tabular-nums",
                  getPnlClassName(position.unrealizedPnlUsd)
                )}
              >
                {position.unrealizedPnlUsd === null
                  ? "--"
                  : formatSignedDusdc(position.unrealizedPnlUsd)}
              </span>
              <span className="truncate text-muted-foreground capitalize">
                {position.status}
              </span>
              <span className="text-right font-mono text-muted-foreground tabular-nums">
                {formatRelativeTime(position.lastActivityAt)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2 p-3 lg:hidden">
        {hasUnavailableValues ? (
          <ActivityNotice>
            Live exit values are unavailable. Entry and premium are shown from
            trade history.
          </ActivityNotice>
        ) : null}
        {positions.map((position) => (
          <div
            className="rounded-md border border-border/35 bg-muted/15 px-3 py-3"
            key={position.id}
          >
            <div className="flex min-w-0 items-center gap-2">
              <PositionTypeTag position={position} />
              <span className="truncate text-sm font-medium text-foreground">
                {position.contractLabel}
              </span>
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {position.status} · {formatRelativeTime(position.lastActivityAt)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/35 pt-3 text-xs">
              <MobileStat
                label="Contracts"
                value={formatQuantity(position.size)}
              />
              <MobileStat
                label="Value"
                value={
                  position.currentValueUsd === null
                    ? "--"
                    : formatDusdc(position.currentValueUsd)
                }
              />
              <MobileStat
                className={getPnlClassName(position.unrealizedPnlUsd)}
                label="PnL"
                value={
                  position.unrealizedPnlUsd === null
                    ? "--"
                    : formatSignedDusdc(position.unrealizedPnlUsd)
                }
              />
              <MobileStat
                label="Expiry"
                value={formatExpiryDistance(position.expiryMs)}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
