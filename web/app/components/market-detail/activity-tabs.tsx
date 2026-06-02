import { type ReactNode, useEffect, useState } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { ActivityIcon, BriefcaseIcon, RotateCcwIcon } from "lucide-react"

import { Card } from "~/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { formatRelativeTime, formatUsd } from "~/lib/callit/format"
import { type MarketSnapshot } from "~/lib/callit/market/types"
import { filterPositions } from "~/lib/callit/trade/positions"
import {
  type Position,
  type RangeRedemption,
  type RangeTrade,
  type Redemption,
  type Trade,
} from "~/lib/callit/trade/types"
import {
  getManagerPositionSummaries,
  getPredictManagers,
} from "~/lib/deepbook/predict-client"
import { cn } from "~/lib/utils"

interface PositionLoadState {
  errorMessage?: string
  isLoading: boolean
  positions: Position[]
}

export interface ActivityTabsProps {
  market: MarketSnapshot
  rangeRedemptions: RangeRedemption[]
  rangeTrades: RangeTrade[]
  redemptions: Redemption[]
  trades: Trade[]
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

type ActivityTradeRow =
  | ({ kind: "directional" } & Trade)
  | ({ kind: "range" } & RangeTrade)

type RedemptionRow =
  | {
      bidPrice: number
      id: string
      kind: "directional"
      owner: string
      payoutUsd: number
      quantity: number
      side: "above" | "below"
      strikePriceUsd: number
      timestampMs: number
    }
  | {
      bidPrice: number
      higherStrikePriceUsd: number
      id: string
      kind: "range"
      lowerStrikePriceUsd: number
      owner: string
      payoutUsd: number
      quantity: number
      timestampMs: number
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

function getPositionContract(position: Position) {
  return `${formatUsd(position.strikePriceUsd, 0)} ${getSideLabel(position.side)}`
}

function getTradeContract(trade: Trade) {
  return `${formatUsd(trade.strikePriceUsd, 0)} ${getSideLabel(trade.side)}`
}

function getActivityTradeContract(trade: ActivityTradeRow) {
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

function sortPositionsNewestFirst(positions: Position[]) {
  return positions
    .slice()
    .sort(
      (firstPosition, secondPosition) =>
        secondPosition.lastActivityAt - firstPosition.lastActivityAt ||
        firstPosition.id.localeCompare(secondPosition.id)
    )
}

function getTradeRows(
  trades: Trade[],
  rangeTrades: RangeTrade[]
): ActivityTradeRow[] {
  return [
    ...trades.map((trade) => ({ ...trade, kind: "directional" as const })),
    ...rangeTrades.map((trade) => ({ ...trade, kind: "range" as const })),
  ].sort(
    (firstTrade, secondTrade) =>
      secondTrade.timestampMs - firstTrade.timestampMs ||
      firstTrade.id.localeCompare(secondTrade.id)
  )
}

export function ActivityTabs(props: ActivityTabsProps) {
  const [isClient, setIsClient] = useState(false)
  const tradeRows = getTradeRows(props.trades, props.rangeTrades)

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
          props.redemptions.length > 0 || props.rangeRedemptions.length > 0 ? (
            <RedemptionsTable
              rangeRedemptions={props.rangeRedemptions}
              redemptions={props.redemptions}
            />
          ) : (
            <EmptyState message="No redemptions for this market." />
          )
        }
        redemptionsLabel={`Redemptions (${props.redemptions.length + props.rangeRedemptions.length})`}
        tradesContent={
          tradeRows.length > 0 ? (
            <TradesTable trades={tradeRows} />
          ) : (
            <EmptyState message="No trades for this market." />
          )
        }
        tradesLabel={`Trades (${tradeRows.length})`}
      />
    )
  }

  return <ActivityTabsClient {...props} />
}

function ActivityTabsClient(props: ActivityTabsProps) {
  const { market, rangeRedemptions, rangeTrades, redemptions, trades } = props
  const { primaryWallet } = useDynamicContext()
  const [positionState, setPositionState] = useState<PositionLoadState>({
    isLoading: false,
    positions: [],
  })
  const walletAddress = primaryWallet?.address
  const publicActivityVersion = `${trades.length}:${rangeTrades.length}:${redemptions.length}:${rangeRedemptions.length}`

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

        const summaries = await getManagerPositionSummaries(manager.manager_id)
        const positions = filterPositions(summaries, {
          expiryMs: market.expiryMs,
          oracleId: market.oracleId,
        })

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

  const visiblePositions = sortPositionsNewestFirst(positionState.positions)
  const tradeRows = getTradeRows(trades, rangeTrades)
  const positionsLabel = positionState.isLoading
    ? "Positions"
    : `Positions (${visiblePositions.length})`
  const tradesLabel = `Trades (${tradeRows.length})`
  const redemptionsLabel = `Redemptions (${redemptions.length + rangeRedemptions.length})`

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
          rangeRedemptions={rangeRedemptions}
          redemptions={redemptions}
          totalRedemptions={redemptions.length + rangeRedemptions.length}
        />
      }
      redemptionsLabel={redemptionsLabel}
      tradesContent={
        <TradesPanel totalTrades={tradeRows.length} trades={tradeRows} />
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
  positions: Position[]
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

function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <div className="min-w-[56rem] flex-1 divide-y divide-border/35 overflow-auto">
      <PositionHeaderRow
        columns={["Contract", "Qty", "Entry", "Mark", "Cost", "PnL", "Status"]}
      />
      {positions.map((position) => {
        const pnl = position.unrealizedPnlUsd + position.realizedPnlUsd

        return (
          <div
            className="grid grid-cols-[9rem_7rem_6rem_6rem_7rem_7rem_6rem] gap-4 px-3 py-2.5 text-xs"
            key={position.id}
          >
            <span
              className={cn(
                "truncate font-medium capitalize",
                position.side === "above"
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
                pnl > 0
                  ? "text-outcome-up"
                  : pnl < 0
                    ? "text-outcome-down"
                    : "text-muted-foreground"
              )}
            >
              {formatPnlUsd(pnl)}
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
  trades: ActivityTradeRow[]
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
  rangeRedemptions,
  redemptions,
  totalRedemptions,
}: {
  rangeRedemptions: RangeRedemption[]
  redemptions: Redemption[]
  totalRedemptions: number
}) {
  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-3">
        <div className="text-xs text-muted-foreground">
          {totalRedemptions} total for expiry
        </div>
      </div>

      {redemptions.length > 0 || rangeRedemptions.length > 0 ? (
        <RedemptionsTable
          rangeRedemptions={rangeRedemptions}
          redemptions={redemptions}
        />
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

function TradesTable({ trades }: { trades: ActivityTradeRow[] }) {
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
  rangeRedemptions,
  redemptions,
}: {
  rangeRedemptions: RangeRedemption[]
  redemptions: Redemption[]
}) {
  const rows: RedemptionRow[] = [
    ...redemptions.map((redemption) => ({
      bidPrice: redemption.bidPrice,
      id: redemption.id,
      kind: "directional" as const,
      owner: redemption.owner,
      payoutUsd: redemption.payoutUsd,
      quantity: redemption.quantity,
      side: redemption.side,
      strikePriceUsd: redemption.strikePriceUsd,
      timestampMs: redemption.timestampMs,
    })),
    ...rangeRedemptions.map((redemption) => ({
      bidPrice: redemption.bidPrice,
      higherStrikePriceUsd: redemption.higherStrikePriceUsd,
      id: redemption.id,
      kind: "range" as const,
      lowerStrikePriceUsd: redemption.lowerStrikePriceUsd,
      owner: redemption.trader,
      payoutUsd: redemption.payoutUsd,
      quantity: redemption.quantity,
      timestampMs: redemption.timestampMs,
    })),
  ].sort(
    (firstRedemption, secondRedemption) =>
      secondRedemption.timestampMs - firstRedemption.timestampMs ||
      firstRedemption.id.localeCompare(secondRedemption.id)
  )

  return (
    <div className="min-w-[44rem] flex-1 divide-y divide-border/35 overflow-auto">
      <HeaderRow
        columns={["Time", "Type", "Price", "Owner", "Size", "Payout"]}
      />
      {rows.map((redemption) => (
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
          <AddressText address={redemption.owner} />
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
