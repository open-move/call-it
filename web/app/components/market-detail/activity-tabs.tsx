import { type ReactNode, useEffect, useState } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { ActivityIcon, BriefcaseIcon, RotateCcwIcon } from "lucide-react"

import { Card } from "~/components/ui/card"
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

export interface ActivityTabsProps {
  market: MarketSnapshot
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

function getActivityTabIcon(value: ActivityTabValue) {
  switch (value) {
    case "positions":
      return BriefcaseIcon
    case "trades":
      return ActivityIcon
    case "redemptions":
      return RotateCcwIcon
  }
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
    maximumFractionDigits: 6,
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

function getPositionContract(position: PositionRow) {
  return position.kind === "directional"
    ? `${formatUsd(position.strikePriceUsd, 0)} ${getSideLabel(position.side)}`
    : `${formatRange(position.lowerStrikePriceUsd, position.higherStrikePriceUsd)} Range`
}

function getTradeContract(trade: {
  side: "above" | "below"
  strikePriceUsd: number
}) {
  return `${formatUsd(trade.strikePriceUsd, 0)} ${getSideLabel(trade.side)}`
}

function getActivityTradeContract(trade: TradeActivityRow) {
  return trade.kind === "directional"
    ? getTradeContract(trade)
    : `${formatRange(trade.lowerStrikePriceUsd, trade.higherStrikePriceUsd)} Range`
}

function getRedemptionContract(redemption: {
  side: "above" | "below"
  strikePriceUsd: number
}) {
  return `${formatUsd(redemption.strikePriceUsd, 0)} ${getSideLabel(redemption.side)}`
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
            <RedemptionsTable redemptions={props.redemptions} />
          ) : (
            <EmptyState message="No redemptions for this market." />
          )
        }
        redemptionsLabel={`Redemptions (${props.redemptions.length})`}
        tradesContent={
          props.trades.length > 0 ? (
            <TradesTable trades={props.trades} />
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
  const { market, redemptions, trades } = props
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
          errorMessage={positionState.errorMessage}
          isLoading={positionState.isLoading}
          positions={visiblePositions}
          totalPositions={positionState.positions.length}
          walletAddress={walletAddress}
        />
      }
      positionsLabel={positionsLabel}
      redemptionsContent={
        <RedemptionsPanel
          redemptions={redemptions}
          totalRedemptions={redemptions.length}
        />
      }
      redemptionsLabel={redemptionsLabel}
      tradesContent={
        <TradesPanel totalTrades={trades.length} trades={trades} />
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
          className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
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
  const TabIcon = getActivityTabIcon(value)

  return (
    <TabsTrigger className="h-full flex-none rounded-none px-0" value={value}>
      <TabIcon className="size-3.5" />
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
  errorMessage,
  isLoading,
  positions,
  totalPositions,
  walletAddress,
}: {
  errorMessage?: string
  isLoading: boolean
  positions: PositionRow[]
  totalPositions: number
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
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-3">
        <div className="text-xs text-muted-foreground">
          {totalPositions} total for expiry
        </div>
      </div>

      {positions.length > 0 ? (
        <PositionsTable positions={positions} />
      ) : (
        <EmptyState message={emptyMessage} />
      )}
    </div>
  )
}

function PositionHeaderRow({ columns }: { columns: string[] }) {
  return (
    <div className="grid grid-cols-[9rem_7rem_6rem_6rem_7rem_7rem_6rem] gap-4 border-b border-border/45 px-3 py-2.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
      {columns.map((column) => (
        <span className="truncate last:text-right" key={column}>
          {column}
        </span>
      ))}
    </div>
  )
}

function PositionsTable({ positions }: { positions: PositionRow[] }) {
  return (
    <div className="min-w-[56rem] flex-1 divide-y divide-border/35 overflow-auto">
      <PositionHeaderRow
        columns={["Contract", "Qty", "Entry", "Mark", "Cost", "PnL", "Status"]}
      />
      {positions.map((position) => {
        const pnl =
          position.kind === "directional"
            ? position.unrealizedPnlUsd + position.realizedPnlUsd
            : null

        return (
          <div
            className="grid grid-cols-[9rem_7rem_6rem_6rem_7rem_7rem_6rem] gap-4 px-3 py-2.5 text-xs"
            key={position.id}
          >
            <span
              className={cn(
                "truncate font-medium capitalize",
                position.kind === "range"
                  ? "text-primary"
                  : position.side === "above"
                    ? "text-outcome-up"
                    : "text-outcome-down"
              )}
            >
              {getPositionContract(position)}
            </span>
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
              {formatCostUsd(position.openCostBasisUsd)}
            </span>
            <span
              className={cn(
                "font-mono tabular-nums",
                pnl === null
                  ? "text-muted-foreground"
                  : pnl > 0
                    ? "text-outcome-up"
                    : pnl < 0
                      ? "text-outcome-down"
                      : "text-muted-foreground"
              )}
            >
              {pnl === null ? "--" : formatPnlUsd(pnl)}
            </span>
            <span className="truncate text-right font-mono text-muted-foreground uppercase">
              {position.status}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function TradesPanel({
  totalTrades,
  trades,
}: {
  totalTrades: number
  trades: TradeActivityRow[]
}) {
  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-3">
        <div className="text-xs text-muted-foreground">
          {totalTrades} total for expiry
        </div>
      </div>

      {trades.length > 0 ? (
        <TradesTable trades={trades} />
      ) : (
        <EmptyState message="No trades for this market." />
      )}
    </div>
  )
}

function RedemptionsPanel({
  redemptions,
  totalRedemptions,
}: {
  redemptions: RedemptionActivityRow[]
  totalRedemptions: number
}) {
  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-3">
        <div className="text-xs text-muted-foreground">
          {totalRedemptions} total for expiry
        </div>
      </div>

      {redemptions.length > 0 ? (
        <RedemptionsTable redemptions={redemptions} />
      ) : (
        <EmptyState message="No redemptions for this market." />
      )}
    </div>
  )
}

function HeaderRow({ columns }: { columns: string[] }) {
  return (
    <div className="grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 border-b border-border/45 px-3 py-2.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
      {columns.map((column) => (
        <span className="truncate last:text-right" key={column}>
          {column}
        </span>
      ))}
    </div>
  )
}

function TradesTable({ trades }: { trades: TradeActivityRow[] }) {
  return (
    <div className="min-w-[48rem] flex-1 divide-y divide-border/35 overflow-auto">
      <HeaderRow
        columns={["Time", "Contract", "Price", "Trader", "Size", "Cost"]}
      />
      {trades.map((trade) => (
        <div
          className="grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 px-3 py-2.5 text-xs"
          key={trade.id}
        >
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatRelativeTime(trade.timestampMs)}
          </span>
          {trade.kind === "directional" ? (
            <span
              className={cn(
                "font-medium capitalize",
                trade.side === "above" ? "text-outcome-up" : "text-outcome-down"
              )}
            >
              {getActivityTradeContract(trade)}
            </span>
          ) : (
            <span className="font-mono tabular-nums">
              {getActivityTradeContract(trade)}
            </span>
          )}
          <span className="font-mono tabular-nums">
            {formatPriceCents(trade.price)}
          </span>
          <AddressText address={trade.trader} />
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatQuantity(trade.quantity)}
          </span>
          <span className="text-right font-mono tabular-nums">
            {formatCostUsd(trade.costUsd)}
          </span>
        </div>
      ))}
    </div>
  )
}

function RedemptionsTable({
  redemptions,
}: {
  redemptions: RedemptionActivityRow[]
}) {
  return (
    <div className="min-w-[44rem] flex-1 divide-y divide-border/35 overflow-auto">
      <HeaderRow
        columns={["Time", "Type", "Price", "Owner", "Size", "Payout"]}
      />
      {redemptions.map((redemption) => (
        <div
          className="grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 px-3 py-2.5 text-xs"
          key={redemption.id}
        >
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatRelativeTime(redemption.timestampMs)}
          </span>
          {redemption.kind === "directional" ? (
            <span
              className={cn(
                "font-medium capitalize",
                redemption.side === "above"
                  ? "text-outcome-up"
                  : "text-outcome-down"
              )}
            >
              {getRedemptionContract(redemption)}
            </span>
          ) : (
            <span className="font-mono tabular-nums">
              {formatRange(
                redemption.lowerStrikePriceUsd,
                redemption.higherStrikePriceUsd
              )}
            </span>
          )}
          <span className="font-mono tabular-nums">
            {formatPriceCents(redemption.bidPrice)}
          </span>
          <AddressText
            address={
              redemption.kind === "directional"
                ? redemption.owner
                : redemption.trader
            }
          />
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatQuantity(redemption.quantity)}
          </span>
          <span className="text-right font-mono tabular-nums">
            {formatCostUsd(redemption.payoutUsd)}
          </span>
        </div>
      ))}
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
