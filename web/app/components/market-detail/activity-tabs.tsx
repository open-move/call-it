import { type ReactNode, useEffect, useState } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"

import { Card } from "~/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { formatRelativeTime, formatUsd } from "~/lib/callit/format"
import { type MarketSnapshot } from "~/lib/callit/market/types"
import {
  getPositionRows,
  getRangePositionsFromActivity,
} from "~/lib/callit/trade/activity"
import { filterPositions } from "~/lib/callit/trade/positions"
import {
  type PositionRow,
  type PositionTradeIntent,
  type RedemptionActivityRow,
  type TradeActivityRow,
} from "~/lib/callit/trade/types"
import {
  getManagerRanges,
  getManagerPositionSummaries,
  getPredictManagers,
} from "~/lib/deepbook/predict-client"
import { cn } from "~/lib/utils"

interface PositionLoadState {
  errorMessage?: string
  isLoading: boolean
  positions: PositionRow[]
}

type AddPositionIntent =
  | Omit<Extract<PositionTradeIntent, { kind: "binary" }>, "intentId">
  | Omit<Extract<PositionTradeIntent, { kind: "range" }>, "intentId">

export interface ActivityTabsProps {
  market: MarketSnapshot
  onAddPosition: (intent: AddPositionIntent) => void
  redemptions: RedemptionActivityRow[]
  trades: TradeActivityRow[]
}

interface ActivityTabsFrameProps {
  positionsContent: ReactNode
  positionsLabel: string
  redemptionsContent: ReactNode
  redemptionsLabel: string
  tradesContent: ReactNode
  tradesLabel: string
}

type ActivityTabValue = "positions" | "trades" | "redemptions"
type ContractTone = "above" | "below" | "range"

interface ContractToneInput {
  kind: "directional" | "range"
  side?: "above" | "below"
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatCostUsd(value: number) {
  return value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  })
}

function formatPriceCents(price: number) {
  return `${(price * 100).toFixed(1)}c`
}

function formatNullablePriceCents(price: number | null) {
  return price === null ? "--" : formatPriceCents(price)
}

function formatQuantity(quantity: number) {
  return quantity.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })
}

function formatPositionQuantity(quantity: number) {
  return quantity.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  })
}

function formatCompactCostUsd(value: number) {
  return value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
    minimumFractionDigits: value >= 100 ? 0 : 2,
    style: "currency",
  })
}

function formatPnlUsd(value: number) {
  const formatted = formatCostUsd(Math.abs(value))

  if (value > 0) {
    return `+${formatted}`
  }

  if (value < 0) {
    return `-${formatted}`
  }

  return formatted
}

function formatRange(
  lowerStrikePriceUsd: number,
  higherStrikePriceUsd: number
) {
  return `${formatUsd(lowerStrikePriceUsd, 0)}-${formatUsd(higherStrikePriceUsd, 0)}`
}

function getSideLabel(side: "above" | "below") {
  return side === "above" ? "Up" : "Down"
}

function getPositionContract(position: PositionRow, assetSymbol: string) {
  return position.kind === "directional"
    ? `${assetSymbol} ${formatUsd(position.strikePriceUsd, 0)} ${getSideLabel(position.side)}`
    : `${assetSymbol} ${formatRange(position.lowerStrikePriceUsd, position.higherStrikePriceUsd)} Range`
}

function getPositionKindLabel(position: PositionRow) {
  return position.kind === "range" ? "RNG" : getSideLabel(position.side)
}

function getContractTone(row: ContractToneInput): ContractTone {
  return row.kind === "range"
    ? "range"
    : row.side === "above"
      ? "above"
      : "below"
}

function getContractTextClass(row: ContractToneInput) {
  const tone = getContractTone(row)

  if (tone === "range") {
    return "text-primary"
  }

  return tone === "above" ? "text-outcome-up" : "text-outcome-down"
}

function getContractKindLabel(row: ContractToneInput) {
  return row.kind === "range" ? "RNG" : getSideLabel(row.side ?? "below")
}

function getPositionTextClass(position: PositionRow) {
  return getContractTextClass(position)
}

function getPositionActionLabel(position: PositionRow) {
  const status = position.status.toLowerCase()

  if (status === "active" || status === "open") {
    return "Add"
  }

  if (status === "redeemable") {
    return "Redeem"
  }

  return "Details"
}

function getPositionAddIntent(position: PositionRow): AddPositionIntent {
  return position.kind === "directional"
    ? {
        kind: "binary",
        side: position.side,
        strikePriceUsd: position.strikePriceUsd,
      }
    : {
        higherStrikePriceUsd: position.higherStrikePriceUsd,
        kind: "range",
        lowerStrikePriceUsd: position.lowerStrikePriceUsd,
      }
}

function canAddToPosition(position: PositionRow) {
  const status = position.status.toLowerCase()

  return status === "active" || status === "open"
}

function getTradeContract(trade: {
  side: "above" | "below"
  strikePriceUsd: number
}) {
  return `${formatUsd(trade.strikePriceUsd, 0)} ${getSideLabel(trade.side)}`
}

function getActivityTradeContract(
  trade: TradeActivityRow,
  assetSymbol: string
) {
  return trade.kind === "directional"
    ? `${assetSymbol} ${getTradeContract(trade)}`
    : `${assetSymbol} ${formatRange(trade.lowerStrikePriceUsd, trade.higherStrikePriceUsd)} Range`
}

function getRedemptionContract(
  redemption: RedemptionActivityRow,
  assetSymbol: string
) {
  return redemption.kind === "directional"
    ? `${assetSymbol} ${formatUsd(redemption.strikePriceUsd, 0)} ${getSideLabel(redemption.side)}`
    : `${assetSymbol} ${formatRange(redemption.lowerStrikePriceUsd, redemption.higherStrikePriceUsd)} Range`
}

export function ActivityTabs(props: ActivityTabsProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <ActivityTabsFrame
        positionsContent={
          <EmptyState message="Connect wallet to view your positions." />
        }
        positionsLabel="Positions"
        redemptionsContent={
          props.redemptions.length > 0 ? (
            <RedemptionsTable
              assetSymbol={props.market.assetSymbol}
              redemptions={props.redemptions}
            />
          ) : (
            <EmptyState message="No redemptions for this market." />
          )
        }
        redemptionsLabel={`Redemptions (${props.redemptions.length})`}
        tradesContent={
          props.trades.length > 0 ? (
            <TradesTable
              assetSymbol={props.market.assetSymbol}
              trades={props.trades}
            />
          ) : (
            <EmptyState message="No trades for this market." />
          )
        }
        tradesLabel={`Trades (${props.trades.length})`}
      />
    )
  }

  return <ActivityTabsClient {...props} />
}

function ActivityTabsClient(props: ActivityTabsProps) {
  const { market, onAddPosition, redemptions, trades } = props
  const { primaryWallet } = useDynamicContext()
  const [positionState, setPositionState] = useState<PositionLoadState>({
    isLoading: false,
    positions: [],
  })
  const walletAddress = primaryWallet?.address
  const publicActivityVersion = `${trades.length}:${redemptions.length}`

  useEffect(() => {
    let isStale = false

    async function loadPositions() {
      if (!walletAddress) {
        setPositionState({ isLoading: false, positions: [] })
        return
      }

      setPositionState((currentState) => ({
        ...currentState,
        errorMessage: undefined,
        isLoading: true,
      }))

      try {
        const [manager] = await getPredictManagers(walletAddress)

        if (!manager) {
          if (!isStale) {
            setPositionState({ isLoading: false, positions: [] })
          }

          return
        }

        const [summaries, rangeActivity] = await Promise.all([
          getManagerPositionSummaries(manager.manager_id),
          getManagerRanges(manager.manager_id),
        ])
        const directionalPositions = filterPositions(summaries, {
          expiryMs: market.expiryMs,
          oracleId: market.oracleId,
        })
        const rangePositions = getRangePositionsFromActivity(
          rangeActivity.minted,
          rangeActivity.redeemed,
          {
            expiryMs: market.expiryMs,
            oracleId: market.oracleId,
          }
        )
        const positions = getPositionRows(directionalPositions, rangePositions)

        if (!isStale) {
          setPositionState({ isLoading: false, positions })
        }
      } catch (error) {
        if (!isStale) {
          setPositionState({
            errorMessage:
              error instanceof Error
                ? error.message
                : "Failed to load positions",
            isLoading: false,
            positions: [],
          })
        }
      }
    }

    void loadPositions()

    return () => {
      isStale = true
    }
  }, [market.expiryMs, market.oracleId, publicActivityVersion, walletAddress])

  const visiblePositions = positionState.positions
  const positionsLabel = positionState.isLoading
    ? "Positions"
    : `Positions (${visiblePositions.length})`
  const tradesLabel = `Trades (${trades.length})`
  const redemptionsLabel = `Redemptions (${redemptions.length})`

  return (
    <ActivityTabsFrame
      positionsContent={
        <PositionsPanel
          assetSymbol={market.assetSymbol}
          errorMessage={positionState.errorMessage}
          isLoading={positionState.isLoading}
          onAddPosition={onAddPosition}
          positions={visiblePositions}
          walletAddress={walletAddress}
        />
      }
      positionsLabel={positionsLabel}
      redemptionsContent={
        <RedemptionsPanel
          assetSymbol={market.assetSymbol}
          redemptions={redemptions}
        />
      }
      redemptionsLabel={redemptionsLabel}
      tradesContent={
        <TradesPanel assetSymbol={market.assetSymbol} trades={trades} />
      }
      tradesLabel={tradesLabel}
    />
  )
}

function ActivityTabsFrame({
  positionsContent,
  positionsLabel,
  redemptionsContent,
  redemptionsLabel,
  tradesContent,
  tradesLabel,
}: ActivityTabsFrameProps) {
  return (
    <Card className="h-[24rem] min-w-0 rounded-md border-0 bg-card py-0 shadow-none ring-0 xl:col-span-2">
      <Tabs
        className="flex h-full min-h-0 flex-col gap-0"
        defaultValue="positions"
      >
        <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/45 px-3">
          <TabsList
            className="h-full w-full justify-start gap-6 overflow-x-auto rounded-none p-0"
            variant="line"
          >
            <ActivityTabTrigger label={positionsLabel} value="positions" />
            <ActivityTabTrigger label={tradesLabel} value="trades" />
            <ActivityTabTrigger label={redemptionsLabel} value="redemptions" />
          </TabsList>
          <div className="hidden shrink-0 text-xs text-muted-foreground lg:block">
            Predict activity
          </div>
        </div>

        <TabsContent
          className="min-h-0 flex-1 overflow-hidden px-3 py-3"
          value="positions"
        >
          {positionsContent}
        </TabsContent>

        <TabsContent className="min-h-0 flex-1 overflow-auto" value="trades">
          {tradesContent}
        </TabsContent>

        <TabsContent
          className="min-h-0 flex-1 overflow-auto"
          value="redemptions"
        >
          {redemptionsContent}
        </TabsContent>
      </Tabs>
    </Card>
  )
}

function ActivityTabTrigger({
  label,
  value,
}: {
  label: string
  value: ActivityTabValue
}) {
  return (
    <TabsTrigger className="h-full flex-none rounded-none px-0" value={value}>
      {label}
    </TabsTrigger>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function PositionsPanel({
  assetSymbol,
  errorMessage,
  isLoading,
  onAddPosition,
  positions,
  walletAddress,
}: {
  assetSymbol: string
  errorMessage?: string
  isLoading: boolean
  onAddPosition: (intent: AddPositionIntent) => void
  positions: PositionRow[]
  walletAddress?: string
}) {
  if (!walletAddress) {
    return <EmptyState message="Connect wallet to view your positions." />
  }

  if (errorMessage) {
    return <EmptyState message={errorMessage} />
  }

  const emptyMessage = isLoading
    ? "Loading positions."
    : "No positions for this market."

  return (
    <div className="flex h-full min-h-0 flex-col">
      {positions.length > 0 ? (
        <PositionsTable
          assetSymbol={assetSymbol}
          onAddPosition={onAddPosition}
          positions={positions}
        />
      ) : (
        <EmptyState message={emptyMessage} />
      )}
    </div>
  )
}

function PositionHeaderRow({ columns }: { columns: string[] }) {
  return (
    <div className="grid grid-cols-[minmax(12rem,1.7fr)_7rem_5.25rem_5.25rem_6.5rem_6.5rem_5.5rem] gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
      {columns.map((column) => (
        <span className="truncate last:text-right" key={column}>
          {column}
        </span>
      ))}
    </div>
  )
}

function PositionKindTag({ position }: { position: PositionRow }) {
  return (
    <span
      className={cn(
        "inline-flex w-9 shrink-0 font-mono text-[10px] tracking-wide uppercase",
        getPositionTextClass(position)
      )}
    >
      {getPositionKindLabel(position)}
    </span>
  )
}

function PositionsTable({
  assetSymbol,
  onAddPosition,
  positions,
}: {
  assetSymbol: string
  onAddPosition: (intent: AddPositionIntent) => void
  positions: PositionRow[]
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="min-w-[52rem]">
        <PositionHeaderRow
          columns={[
            "Contract",
            "Position Size",
            "Entry",
            "Mark",
            "Cost",
            "PnL",
            "Action",
          ]}
        />
        {positions.map((position) => {
          const pnl =
            position.kind === "directional"
              ? position.unrealizedPnlUsd + position.realizedPnlUsd
              : null
          const pnlClassName =
            pnl === null
              ? "text-muted-foreground"
              : pnl > 0
                ? "text-outcome-up"
                : pnl < 0
                  ? "text-outcome-down"
                  : "text-muted-foreground"

          return (
            <div
              className="grid grid-cols-[minmax(12rem,1.7fr)_7rem_5.25rem_5.25rem_6.5rem_6.5rem_5.5rem] gap-4 border-b border-border/35 px-3 py-2.5 text-xs"
              key={position.id}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <PositionKindTag position={position} />
                  <span className="truncate font-medium text-foreground">
                    {getPositionContract(position, assetSymbol)}
                  </span>
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase">
                  {position.status} ·{" "}
                  {formatRelativeTime(position.lastActivityAt)}
                </div>
              </div>
              <span className="font-mono text-muted-foreground tabular-nums">
                {formatPositionQuantity(position.openQuantity)}
              </span>
              <span className="font-mono tabular-nums">
                {formatNullablePriceCents(position.averageEntryPrice)}
              </span>
              <span className="font-mono tabular-nums">
                {formatNullablePriceCents(position.markPrice)}
              </span>
              <span className="font-mono tabular-nums">
                {formatCompactCostUsd(position.openCostBasisUsd)}
              </span>
              <span
                className={cn(
                  "text-right font-mono tabular-nums",
                  pnlClassName
                )}
              >
                {pnl === null ? "--" : formatPnlUsd(pnl)}
              </span>
              <PositionActionMenu
                onAddPosition={onAddPosition}
                position={position}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PositionActionMenu({
  onAddPosition,
  position,
}: {
  onAddPosition: (intent: AddPositionIntent) => void
  position: PositionRow
}) {
  const primaryActionLabel = getPositionActionLabel(position)
  const addLabel =
    position.kind === "range" ? "Add to range" : "Add to position"
  const closeLabel =
    position.kind === "range" ? "Close range" : "Close position"
  const status = position.status.toLowerCase()
  const unavailableActionLabel =
    status === "redeemable"
      ? "Redeem"
      : status === "lost" || status === "liquidated"
        ? "Clear position"
        : closeLabel

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Position actions"
          className="h-7 rounded-md bg-muted px-2.5 text-xs text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          type="button"
        >
          Actions
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuLabel className="px-2 py-1 text-[11px] leading-4 font-normal text-muted-foreground">
            {primaryActionLabel} available
          </DropdownMenuLabel>
          {canAddToPosition(position) ? (
            <DropdownMenuItem
              onClick={() => onAddPosition(getPositionAddIntent(position))}
            >
              {addLabel}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem disabled>{unavailableActionLabel}</DropdownMenuItem>
          <DropdownMenuLabel className="px-2 py-1 text-[11px] leading-4 font-normal">
            Requires order-level data
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>View details</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function TradesPanel({
  assetSymbol,
  trades,
}: {
  assetSymbol: string
  trades: TradeActivityRow[]
}) {
  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      {trades.length > 0 ? (
        <TradesTable assetSymbol={assetSymbol} trades={trades} />
      ) : (
        <EmptyState message="No trades for this market." />
      )}
    </div>
  )
}

function RedemptionsPanel({
  assetSymbol,
  redemptions,
}: {
  assetSymbol: string
  redemptions: RedemptionActivityRow[]
}) {
  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      {redemptions.length > 0 ? (
        <RedemptionsTable assetSymbol={assetSymbol} redemptions={redemptions} />
      ) : (
        <EmptyState message="No redemptions for this market." />
      )}
    </div>
  )
}

function ActivityHeaderRow({
  className,
  columns,
}: {
  className: string
  columns: string[]
}) {
  return (
    <div
      className={cn(
        "grid gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase",
        className
      )}
    >
      {columns.map((column) => (
        <span className="truncate last:text-right" key={column}>
          {column}
        </span>
      ))}
    </div>
  )
}

function ContractKindTag({ row }: { row: ContractToneInput }) {
  return (
    <span
      className={cn(
        "inline-flex w-9 shrink-0 font-mono text-[10px] tracking-wide uppercase",
        getContractTextClass(row)
      )}
    >
      {getContractKindLabel(row)}
    </span>
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
          className="grid-cols-[minmax(13rem,1.8fr)_5.25rem_7rem_6.5rem_minmax(7rem,1fr)_5.5rem]"
          columns={[
            "Contract",
            "Price",
            "Position Size",
            "Cost",
            "Trader",
            "Time",
          ]}
        />
        {trades.map((trade) => (
          <div
            className="grid grid-cols-[minmax(13rem,1.8fr)_5.25rem_7rem_6.5rem_minmax(7rem,1fr)_5.5rem] gap-4 border-b border-border/35 px-3 py-2.5 text-xs"
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
              {formatCompactCostUsd(trade.costUsd)}
            </span>
            <AddressText address={trade.trader} />
            <span className="text-right font-mono text-muted-foreground tabular-nums">
              {formatRelativeTime(trade.timestampMs)}
            </span>
          </div>
        ))}
      </div>
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
          className="grid-cols-[minmax(13rem,1.8fr)_5.25rem_7rem_6.5rem_minmax(7rem,1fr)_5.5rem]"
          columns={[
            "Contract",
            "Price",
            "Position Size",
            "Payout",
            "Owner",
            "Time",
          ]}
        />
        {redemptions.map((redemption) => (
          <div
            className="grid grid-cols-[minmax(13rem,1.8fr)_5.25rem_7rem_6.5rem_minmax(7rem,1fr)_5.5rem] gap-4 border-b border-border/35 px-3 py-2.5 text-xs"
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
              {formatCompactCostUsd(redemption.payoutUsd)}
            </span>
            <AddressText
              address={
                redemption.kind === "directional"
                  ? redemption.owner
                  : redemption.trader
              }
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

function AddressText({ address }: { address: string }) {
  return (
    <span className="truncate font-mono text-muted-foreground tabular-nums">
      {formatAddress(address)}
    </span>
  )
}
