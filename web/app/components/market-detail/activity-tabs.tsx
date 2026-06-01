import { type ReactNode, useEffect, useState } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"

import { Button } from "~/components/ui/button"
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

type ActivityScope = "strike" | "oracle"

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
  selectedStrikePriceUsd: number
  trades: Trade[]
}

interface ActivityTabsFrameProps extends ActivityTabsProps {
  positionsContent: ReactNode
  positionsLabel: string
  rangesContent: ReactNode
  rangesLabel: string
  redemptionsContent: ReactNode
  redemptionsLabel: string
  tradesContent: ReactNode
  tradesLabel: string
}

type RedemptionRow =
  | {
      bidPrice: number
      id: string
      isSelected: boolean
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
      isSelected: boolean
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

function isSelectedStrike(
  strikePriceUsd: number,
  selectedStrikePriceUsd: number
) {
  return Math.abs(strikePriceUsd - selectedStrikePriceUsd) < 0.000001
}

function includesSelectedStrike(
  lowerStrikePriceUsd: number,
  higherStrikePriceUsd: number,
  selectedStrikePriceUsd: number
) {
  return (
    selectedStrikePriceUsd >= lowerStrikePriceUsd &&
    selectedStrikePriceUsd <= higherStrikePriceUsd
  )
}

function getPositionContract(position: Position) {
  return `${formatUsd(position.strikePriceUsd, 0)} ${position.side}`
}

function getTradeContract(trade: Trade) {
  return `${formatUsd(trade.strikePriceUsd, 0)} ${trade.side}`
}

function getRedemptionContract(redemption: {
  side: "above" | "below"
  strikePriceUsd: number
}) {
  return `${formatUsd(redemption.strikePriceUsd, 0)} ${redemption.side}`
}

export function ActivityTabs(props: ActivityTabsProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <ActivityTabsFrame
        {...props}
        positionsContent={
          <EmptyState message="Connect wallet to view your positions." />
        }
        positionsLabel="Positions"
        rangesContent={
          props.rangeTrades.length > 0 ? (
            <RangeTradesTable
              selectedStrikePriceUsd={props.selectedStrikePriceUsd}
              trades={props.rangeTrades}
            />
          ) : (
            <EmptyState message="No range activity around this strike yet." />
          )
        }
        rangesLabel={`Ranges (${props.rangeTrades.length})`}
        redemptionsContent={
          props.redemptions.length > 0 || props.rangeRedemptions.length > 0 ? (
            <RedemptionsTable
              rangeRedemptions={props.rangeRedemptions}
              redemptions={props.redemptions}
              selectedStrikePriceUsd={props.selectedStrikePriceUsd}
            />
          ) : (
            <EmptyState message="No redemptions for this contract yet." />
          )
        }
        redemptionsLabel={`Redemptions (${props.redemptions.length + props.rangeRedemptions.length})`}
        tradesContent={
          props.trades.length > 0 ? (
            <TradesTable
              selectedStrikePriceUsd={props.selectedStrikePriceUsd}
              trades={props.trades}
            />
          ) : (
            <EmptyState message="No trades for this strike yet." />
          )
        }
        tradesLabel={`Trades (${props.trades.length})`}
      />
    )
  }

  return <ActivityTabsClient {...props} />
}

function ActivityTabsClient(props: ActivityTabsProps) {
  const {
    market,
    rangeRedemptions,
    rangeTrades,
    redemptions,
    selectedStrikePriceUsd,
    trades,
  } = props
  const { primaryWallet } = useDynamicContext()
  const hasSelectedStrikeTrades = trades.some((trade) =>
    isSelectedStrike(trade.strikePriceUsd, selectedStrikePriceUsd)
  )
  const hasSelectedStrikeRanges = rangeTrades.some((trade) =>
    includesSelectedStrike(
      trade.lowerStrikePriceUsd,
      trade.higherStrikePriceUsd,
      selectedStrikePriceUsd
    )
  )
  const hasSelectedStrikeRedemptions =
    redemptions.some((redemption) =>
      isSelectedStrike(redemption.strikePriceUsd, selectedStrikePriceUsd)
    ) ||
    rangeRedemptions.some((redemption) =>
      includesSelectedStrike(
        redemption.lowerStrikePriceUsd,
        redemption.higherStrikePriceUsd,
        selectedStrikePriceUsd
      )
    )
  const [positionScope, setPositionScope] = useState<ActivityScope>("strike")
  const [tradeScope, setTradeScope] = useState<ActivityScope>(() =>
    hasSelectedStrikeTrades || trades.length === 0 ? "strike" : "oracle"
  )
  const [rangeScope, setRangeScope] = useState<ActivityScope>(() =>
    hasSelectedStrikeRanges || rangeTrades.length === 0 ? "strike" : "oracle"
  )
  const [redemptionScope, setRedemptionScope] = useState<ActivityScope>(() =>
    hasSelectedStrikeRedemptions ||
    redemptions.length + rangeRedemptions.length === 0
      ? "strike"
      : "oracle"
  )
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

  useEffect(() => {
    if (!hasSelectedStrikeTrades && trades.length > 0) {
      setTradeScope("oracle")
    }
  }, [hasSelectedStrikeTrades, trades.length])

  useEffect(() => {
    if (!hasSelectedStrikeRanges && rangeTrades.length > 0) {
      setRangeScope("oracle")
    }
  }, [hasSelectedStrikeRanges, rangeTrades.length])

  useEffect(() => {
    if (
      !hasSelectedStrikeRedemptions &&
      redemptions.length + rangeRedemptions.length > 0
    ) {
      setRedemptionScope("oracle")
    }
  }, [
    hasSelectedStrikeRedemptions,
    rangeRedemptions.length,
    redemptions.length,
  ])

  const visiblePositions =
    positionScope === "strike"
      ? positionState.positions.filter((position) =>
          isSelectedStrike(position.strikePriceUsd, selectedStrikePriceUsd)
        )
      : positionState.positions
  const visibleTrades =
    tradeScope === "strike"
      ? trades.filter((trade) =>
          isSelectedStrike(trade.strikePriceUsd, selectedStrikePriceUsd)
        )
      : trades
  const visibleRangeTrades =
    rangeScope === "strike"
      ? rangeTrades.filter((trade) =>
          includesSelectedStrike(
            trade.lowerStrikePriceUsd,
            trade.higherStrikePriceUsd,
            selectedStrikePriceUsd
          )
        )
      : rangeTrades
  const visibleRedemptions =
    redemptionScope === "strike"
      ? redemptions.filter((redemption) =>
          isSelectedStrike(redemption.strikePriceUsd, selectedStrikePriceUsd)
        )
      : redemptions
  const visibleRangeRedemptions =
    redemptionScope === "strike"
      ? rangeRedemptions.filter((redemption) =>
          includesSelectedStrike(
            redemption.lowerStrikePriceUsd,
            redemption.higherStrikePriceUsd,
            selectedStrikePriceUsd
          )
        )
      : rangeRedemptions
  const positionsLabel = positionState.isLoading
    ? "Positions"
    : `Positions (${visiblePositions.length})`
  const tradesLabel = `Trades (${visibleTrades.length})`
  const rangesLabel = `Ranges (${visibleRangeTrades.length})`
  const redemptionsLabel = `Redemptions (${visibleRedemptions.length + visibleRangeRedemptions.length})`

  return (
    <ActivityTabsFrame
      {...props}
      positionsContent={
        <PositionsPanel
          errorMessage={positionState.errorMessage}
          isLoading={positionState.isLoading}
          positionScope={positionScope}
          positions={visiblePositions}
          selectedStrikePriceUsd={selectedStrikePriceUsd}
          setPositionScope={setPositionScope}
          totalPositions={positionState.positions.length}
          walletAddress={walletAddress}
        />
      }
      positionsLabel={positionsLabel}
      rangeRedemptions={visibleRangeRedemptions}
      rangeTrades={visibleRangeTrades}
      rangesContent={
        <RangesPanel
          rangeScope={rangeScope}
          selectedStrikePriceUsd={selectedStrikePriceUsd}
          setRangeScope={setRangeScope}
          totalRanges={rangeTrades.length}
          trades={visibleRangeTrades}
        />
      }
      rangesLabel={rangesLabel}
      redemptions={visibleRedemptions}
      redemptionsContent={
        <RedemptionsPanel
          rangeRedemptions={visibleRangeRedemptions}
          redemptionScope={redemptionScope}
          redemptions={visibleRedemptions}
          selectedStrikePriceUsd={selectedStrikePriceUsd}
          setRedemptionScope={setRedemptionScope}
          totalRedemptions={redemptions.length + rangeRedemptions.length}
        />
      }
      redemptionsLabel={redemptionsLabel}
      trades={visibleTrades}
      tradesContent={
        <TradesPanel
          selectedStrikePriceUsd={selectedStrikePriceUsd}
          setTradeScope={setTradeScope}
          totalTrades={trades.length}
          tradeScope={tradeScope}
          trades={visibleTrades}
        />
      }
      tradesLabel={tradesLabel}
    />
  )
}

function ActivityTabsFrame({
  positionsContent,
  positionsLabel,
  rangesContent,
  rangesLabel,
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
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/45 px-4">
          <TabsList
            className="h-full w-full justify-start gap-6 overflow-x-auto rounded-none p-0"
            variant="line"
          >
            <TabsTrigger
              className="h-full flex-none rounded-none px-0"
              value="positions"
            >
              {positionsLabel}
            </TabsTrigger>
            <TabsTrigger
              className="h-full flex-none rounded-none px-0"
              value="trades"
            >
              {tradesLabel}
            </TabsTrigger>
            <TabsTrigger
              className="h-full flex-none rounded-none px-0"
              value="ranges"
            >
              {rangesLabel}
            </TabsTrigger>
            <TabsTrigger
              className="h-full flex-none rounded-none px-0"
              value="redemptions"
            >
              {redemptionsLabel}
            </TabsTrigger>
          </TabsList>
          <div className="hidden shrink-0 font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:block">
            Predict activity
          </div>
        </div>

        <TabsContent
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          value="positions"
        >
          {positionsContent}
        </TabsContent>

        <TabsContent className="min-h-0 flex-1 overflow-auto" value="trades">
          {tradesContent}
        </TabsContent>

        <TabsContent className="min-h-0 flex-1 overflow-auto" value="ranges">
          {rangesContent}
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
  positionScope,
  positions,
  selectedStrikePriceUsd,
  setPositionScope,
  totalPositions,
  walletAddress,
}: {
  errorMessage?: string
  isLoading: boolean
  positionScope: ActivityScope
  positions: Position[]
  selectedStrikePriceUsd: number
  setPositionScope: (scope: ActivityScope) => void
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
    : totalPositions === 0
      ? "No positions for this market."
      : "No positions for this strike."

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-3">
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {totalPositions} total for expiry
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
          {(["strike", "oracle"] satisfies ActivityScope[]).map((scope) => {
            const isSelected = positionScope === scope

            return (
              <Button
                aria-pressed={isSelected}
                className={cn(
                  "h-7 rounded-sm px-3 text-xs shadow-none ring-0 focus-visible:ring-0",
                  isSelected
                    ? "bg-primary text-primary-foreground hover:bg-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                key={scope}
                onClick={() => setPositionScope(scope)}
                type="button"
                variant="ghost"
              >
                {scope === "strike" ? "This strike" : "All strikes"}
              </Button>
            )
          })}
        </div>
      </div>

      {positions.length > 0 ? (
        <PositionsTable
          positions={positions}
          selectedStrikePriceUsd={selectedStrikePriceUsd}
        />
      ) : (
        <EmptyState message={emptyMessage} />
      )}
    </div>
  )
}

function PositionHeaderRow({ columns }: { columns: string[] }) {
  return (
    <div className="grid grid-cols-[9rem_7rem_6rem_6rem_7rem_7rem_6rem] gap-4 border-b border-border/45 px-4 py-3 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
      {columns.map((column) => (
        <span className="truncate last:text-right" key={column}>
          {column}
        </span>
      ))}
    </div>
  )
}

function PositionsTable({
  positions,
  selectedStrikePriceUsd,
}: {
  positions: Position[]
  selectedStrikePriceUsd: number
}) {
  return (
    <div className="min-w-[56rem] flex-1 divide-y divide-border/35 overflow-auto">
      <PositionHeaderRow
        columns={["Contract", "Qty", "Entry", "Mark", "Cost", "PnL", "Status"]}
      />
      {positions.map((position) => {
        const isSelected = isSelectedStrike(
          position.strikePriceUsd,
          selectedStrikePriceUsd
        )
        const pnl = position.unrealizedPnlUsd + position.realizedPnlUsd

        return (
          <div
            className={cn(
              "grid grid-cols-[9rem_7rem_6rem_6rem_7rem_7rem_6rem] gap-4 px-4 py-3 text-xs",
              isSelected && "bg-primary/5"
            )}
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
  selectedStrikePriceUsd,
  setTradeScope,
  totalTrades,
  tradeScope,
  trades,
}: {
  selectedStrikePriceUsd: number
  setTradeScope: (scope: ActivityScope) => void
  totalTrades: number
  tradeScope: ActivityScope
  trades: Trade[]
}) {
  const emptyMessage =
    totalTrades === 0
      ? "No trades for this market."
      : "No trades for this strike."

  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-3">
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {totalTrades} total for expiry
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
          {(["strike", "oracle"] satisfies ActivityScope[]).map((scope) => {
            const isSelected = tradeScope === scope

            return (
              <Button
                aria-pressed={isSelected}
                className={cn(
                  "h-7 rounded-sm px-3 text-xs shadow-none ring-0 focus-visible:ring-0",
                  isSelected
                    ? "bg-primary text-primary-foreground hover:bg-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                key={scope}
                onClick={() => setTradeScope(scope)}
                type="button"
                variant="ghost"
              >
                {scope === "strike" ? "This strike" : "All strikes"}
              </Button>
            )
          })}
        </div>
      </div>

      {trades.length > 0 ? (
        <TradesTable
          selectedStrikePriceUsd={selectedStrikePriceUsd}
          trades={trades}
        />
      ) : (
        <EmptyState message={emptyMessage} />
      )}
    </div>
  )
}

function RangesPanel({
  rangeScope,
  selectedStrikePriceUsd,
  setRangeScope,
  totalRanges,
  trades,
}: {
  rangeScope: ActivityScope
  selectedStrikePriceUsd: number
  setRangeScope: (scope: ActivityScope) => void
  totalRanges: number
  trades: RangeTrade[]
}) {
  const emptyMessage =
    totalRanges === 0
      ? "No range activity for this market."
      : "No range activity around this strike."

  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-4">
      <ActivityScopeHeader
        currentScope={rangeScope}
        onScopeChange={setRangeScope}
        totalLabel={`${totalRanges} total for expiry`}
      />

      {trades.length > 0 ? (
        <RangeTradesTable
          selectedStrikePriceUsd={selectedStrikePriceUsd}
          trades={trades}
        />
      ) : (
        <EmptyState message={emptyMessage} />
      )}
    </div>
  )
}

function RedemptionsPanel({
  rangeRedemptions,
  redemptionScope,
  redemptions,
  selectedStrikePriceUsd,
  setRedemptionScope,
  totalRedemptions,
}: {
  rangeRedemptions: RangeRedemption[]
  redemptionScope: ActivityScope
  redemptions: Redemption[]
  selectedStrikePriceUsd: number
  setRedemptionScope: (scope: ActivityScope) => void
  totalRedemptions: number
}) {
  const emptyMessage =
    totalRedemptions === 0
      ? "No redemptions for this market."
      : "No redemptions for this strike."

  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-4">
      <ActivityScopeHeader
        currentScope={redemptionScope}
        onScopeChange={setRedemptionScope}
        totalLabel={`${totalRedemptions} total for expiry`}
      />

      {redemptions.length > 0 || rangeRedemptions.length > 0 ? (
        <RedemptionsTable
          rangeRedemptions={rangeRedemptions}
          redemptions={redemptions}
          selectedStrikePriceUsd={selectedStrikePriceUsd}
        />
      ) : (
        <EmptyState message={emptyMessage} />
      )}
    </div>
  )
}

function ActivityScopeHeader({
  currentScope,
  onScopeChange,
  totalLabel,
}: {
  currentScope: ActivityScope
  onScopeChange: (scope: ActivityScope) => void
  totalLabel: string
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-3">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {totalLabel}
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        {(["strike", "oracle"] satisfies ActivityScope[]).map((scope) => {
          const isSelected = currentScope === scope

          return (
            <Button
              aria-pressed={isSelected}
              className={cn(
                "h-7 rounded-sm px-3 text-xs shadow-none ring-0 focus-visible:ring-0",
                isSelected
                  ? "bg-primary text-primary-foreground hover:bg-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              key={scope}
              onClick={() => onScopeChange(scope)}
              type="button"
              variant="ghost"
            >
              {scope === "strike" ? "This strike" : "All strikes"}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

function HeaderRow({ columns }: { columns: string[] }) {
  return (
    <div className="grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 border-b border-border/45 px-4 py-3 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
      {columns.map((column) => (
        <span className="truncate last:text-right" key={column}>
          {column}
        </span>
      ))}
    </div>
  )
}

function TradesTable({
  selectedStrikePriceUsd,
  trades,
}: {
  selectedStrikePriceUsd: number
  trades: Trade[]
}) {
  return (
    <div className="min-w-[48rem] flex-1 divide-y divide-border/35 overflow-auto">
      <HeaderRow
        columns={["Time", "Contract", "Price", "Trader", "Size", "Cost"]}
      />
      {trades.map((trade) => {
        const isSelected = isSelectedStrike(
          trade.strikePriceUsd,
          selectedStrikePriceUsd
        )

        return (
          <div
            className={cn(
              "grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 px-4 py-3 text-xs",
              isSelected && "bg-primary/5"
            )}
            key={trade.id}
          >
            <span className="font-mono text-muted-foreground tabular-nums">
              {formatRelativeTime(trade.timestampMs)}
            </span>
            <span
              className={cn(
                "font-medium capitalize",
                trade.side === "above" ? "text-outcome-up" : "text-outcome-down"
              )}
            >
              {getTradeContract(trade)}
            </span>
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
        )
      })}
    </div>
  )
}

function RangeTradesTable({
  selectedStrikePriceUsd,
  trades,
}: {
  selectedStrikePriceUsd: number
  trades: RangeTrade[]
}) {
  return (
    <div className="min-w-[44rem] flex-1 divide-y divide-border/35 overflow-auto">
      <HeaderRow
        columns={["Time", "Range", "Price", "Trader", "Size", "Cost"]}
      />
      {trades.map((trade) => {
        const isSelected = includesSelectedStrike(
          trade.lowerStrikePriceUsd,
          trade.higherStrikePriceUsd,
          selectedStrikePriceUsd
        )

        return (
          <div
            className={cn(
              "grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 px-4 py-3 text-xs",
              isSelected && "bg-primary/5"
            )}
            key={trade.id}
          >
            <span className="font-mono text-muted-foreground tabular-nums">
              {formatRelativeTime(trade.timestampMs)}
            </span>
            <span className="font-mono tabular-nums">
              {formatRange(
                trade.lowerStrikePriceUsd,
                trade.higherStrikePriceUsd
              )}
            </span>
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
        )
      })}
    </div>
  )
}

function RedemptionsTable({
  rangeRedemptions,
  redemptions,
  selectedStrikePriceUsd,
}: {
  rangeRedemptions: RangeRedemption[]
  redemptions: Redemption[]
  selectedStrikePriceUsd: number
}) {
  const rows: RedemptionRow[] = [
    ...redemptions.map((redemption) => ({
      bidPrice: redemption.bidPrice,
      id: redemption.id,
      isSelected: isSelectedStrike(
        redemption.strikePriceUsd,
        selectedStrikePriceUsd
      ),
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
      isSelected: includesSelectedStrike(
        redemption.lowerStrikePriceUsd,
        redemption.higherStrikePriceUsd,
        selectedStrikePriceUsd
      ),
      kind: "range" as const,
      lowerStrikePriceUsd: redemption.lowerStrikePriceUsd,
      owner: redemption.trader,
      payoutUsd: redemption.payoutUsd,
      quantity: redemption.quantity,
      timestampMs: redemption.timestampMs,
    })),
  ].sort(
    (firstRedemption, secondRedemption) =>
      secondRedemption.timestampMs - firstRedemption.timestampMs
  )

  return (
    <div className="min-w-[44rem] flex-1 divide-y divide-border/35 overflow-auto">
      <HeaderRow
        columns={["Time", "Type", "Price", "Owner", "Size", "Payout"]}
      />
      {rows.map((redemption) => (
        <div
          className={cn(
            "grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 px-4 py-3 text-xs",
            redemption.isSelected && "bg-primary/5"
          )}
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
