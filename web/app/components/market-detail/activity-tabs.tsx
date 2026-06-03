import { type ReactNode, useEffect, useState } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useRevalidator } from "react-router"

import { Button } from "~/components/ui/button"
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
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
  getManagerRanges,
  getManagerPositionSummaries,
  getPredictManagers,
} from "~/lib/deepbook/predict-client"
import {
  applyDirectionalActivityOrderIds,
  hydrateDirectionalActivityOrderIds,
  hydrateRangeActivityOrderIds,
} from "~/lib/deepbook/predict-order-ids"
import {
  buildPredictRedeemTransaction,
  executeSuiTransaction,
  simulatePredictRedeemTransaction,
  type PredictRedeemParams,
  type SuiTransactionSigner,
} from "~/lib/deepbook/predict-transactions"
import { cn } from "~/lib/utils"

interface PositionLoadState {
  errorMessage?: string
  isLoading: boolean
  managerId?: string
  positions: PositionRow[]
}

interface PositionPreviewState {
  errorMessage?: string
  isExecuting?: boolean
  isLoading: boolean
  message?: string
  positionId?: string
}

interface PositionConfirmState {
  position?: PositionRow
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

const DIRECTIONAL_ORDER_EVENT_LIMIT = 1_000

function isSuiTransactionSigner(value: unknown): value is SuiTransactionSigner {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const candidate = value as { signTransaction?: unknown }

  return typeof candidate.signTransaction === "function"
}

interface ContractToneInput {
  kind: "directional" | "range"
  side?: "above" | "below"
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function addressMatches(firstAddress: string, secondAddress: string) {
  return firstAddress.toLowerCase() === secondAddress.toLowerCase()
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

function getPositionLifecycleActionLabel(position: PositionRow) {
  const status = position.status.toLowerCase()

  if (status === "redeemable") {
    return "Redeem"
  }

  if (status === "lost" || status === "liquidated") {
    return "Clear position"
  }

  return position.kind === "range" ? "Close range" : "Close position"
}

function getPositionRedeemParams({
  market,
  position,
  walletAddress,
}: {
  market: MarketSnapshot
  position: PositionRow
  walletAddress: string
}): PredictRedeemParams | undefined {
  const [orderId] = position.orderIds

  if (!orderId) {
    return undefined
  }

  return position.kind === "directional"
    ? {
        expiryMs: market.expiryMs,
        isUp: position.side === "above",
        kind: "binary",
        oracleId: market.oracleId,
        orderId,
        strikePriceUsd: position.strikePriceUsd,
        walletAddress,
      }
    : {
        expiryMs: market.expiryMs,
        higherStrikePriceUsd: position.higherStrikePriceUsd,
        kind: "range",
        lowerStrikePriceUsd: position.lowerStrikePriceUsd,
        oracleId: market.oracleId,
        orderId,
        walletAddress,
      }
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

function isWalletTrade(trade: TradeActivityRow, walletAddress: string) {
  return addressMatches(trade.trader, walletAddress)
}

function getRedemptionContract(
  redemption: RedemptionActivityRow,
  assetSymbol: string
) {
  return redemption.kind === "directional"
    ? `${assetSymbol} ${formatUsd(redemption.strikePriceUsd, 0)} ${getSideLabel(redemption.side)}`
    : `${assetSymbol} ${formatRange(redemption.lowerStrikePriceUsd, redemption.higherStrikePriceUsd)} Range`
}

function getRedemptionOwner(redemption: RedemptionActivityRow) {
  return redemption.kind === "directional"
    ? redemption.owner
    : redemption.trader
}

function isWalletRedemption(
  redemption: RedemptionActivityRow,
  walletAddress: string
) {
  return addressMatches(getRedemptionOwner(redemption), walletAddress)
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
          <EmptyState message="Connect wallet to view your redemptions." />
        }
        redemptionsLabel="Redemptions"
        tradesContent={
          <EmptyState message="Connect wallet to view your trades." />
        }
        tradesLabel="Trades"
      />
    )
  }

  return <ActivityTabsClient {...props} />
}

function ActivityTabsClient(props: ActivityTabsProps) {
  const { market, onAddPosition, redemptions, trades } = props
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const revalidator = useRevalidator()
  const [positionState, setPositionState] = useState<PositionLoadState>({
    isLoading: false,
    positions: [],
  })
  const [previewState, setPreviewState] = useState<PositionPreviewState>({
    isLoading: false,
  })
  const [confirmState, setConfirmState] = useState<PositionConfirmState>({})
  const [positionRefreshNonce, setPositionRefreshNonce] = useState(0)
  const walletAddress = primaryWallet?.address
  const publicActivityVersion = `${trades.length}:${redemptions.length}`

  async function previewPositionLifecycle(position: PositionRow) {
    if (!walletAddress || !positionState.managerId) {
      setPreviewState({
        errorMessage: "Connect wallet to preview this action.",
        isLoading: false,
        positionId: position.id,
      })
      return
    }

    const params = getPositionRedeemParams({
      market,
      position,
      walletAddress,
    })

    if (!params) {
      setPreviewState({
        errorMessage: "This position is missing order-level data.",
        isLoading: false,
        positionId: position.id,
      })
      return
    }

    setPreviewState({ isLoading: true, positionId: position.id })

    try {
      const events = await simulatePredictRedeemTransaction({
        managerId: positionState.managerId,
        params,
      })

      setPreviewState({
        isLoading: false,
        message: `${getPositionLifecycleActionLabel(position)} preview succeeded (${events.length} events).`,
        positionId: position.id,
      })
    } catch (error) {
      setPreviewState({
        errorMessage:
          error instanceof Error ? error.message : "Preview simulation failed.",
        isLoading: false,
        positionId: position.id,
      })
    }
  }

  async function executePositionLifecycle(position: PositionRow) {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    if (!positionState.managerId) {
      setPreviewState({
        errorMessage: "Could not resolve trading account.",
        isLoading: false,
        positionId: position.id,
      })
      return
    }

    if (!isSuiTransactionSigner(primaryWallet)) {
      setPreviewState({
        errorMessage: "Connected wallet cannot sign Sui transactions.",
        isLoading: false,
        positionId: position.id,
      })
      return
    }

    const params = getPositionRedeemParams({
      market,
      position,
      walletAddress,
    })

    if (!params) {
      setPreviewState({
        errorMessage: "This position is missing order-level data.",
        isLoading: false,
        positionId: position.id,
      })
      return
    }

    const actionLabel = getPositionLifecycleActionLabel(position)

    setConfirmState({})
    setPreviewState({
      isExecuting: true,
      isLoading: true,
      message: `Previewing ${actionLabel.toLowerCase()}.`,
      positionId: position.id,
    })

    try {
      await simulatePredictRedeemTransaction({
        managerId: positionState.managerId,
        params,
      })

      setPreviewState({
        isExecuting: true,
        isLoading: false,
        message: "Wallet approval requested.",
        positionId: position.id,
      })

      const result = await executeSuiTransaction(
        primaryWallet,
        buildPredictRedeemTransaction({
          managerId: positionState.managerId,
          params,
        })
      )

      setPreviewState({
        isExecuting: false,
        isLoading: false,
        message: `${actionLabel} confirmed (${result.events.length} events).`,
        positionId: position.id,
      })
      setPositionRefreshNonce((currentNonce) => currentNonce + 1)
      revalidator.revalidate()
      window.setTimeout(() => revalidator.revalidate(), 1_500)
    } catch (error) {
      setPreviewState({
        errorMessage:
          error instanceof Error ? error.message : `${actionLabel} failed.`,
        isExecuting: false,
        isLoading: false,
        positionId: position.id,
      })
    }
  }

  useEffect(() => {
    let isStale = false

    async function loadPositions() {
      if (!walletAddress) {
        setPositionState({ isLoading: false, positions: [] })
        setPreviewState({ isLoading: false })
        setConfirmState({})
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
            setPreviewState({ isLoading: false })
            setConfirmState({})
          }

          return
        }

        const [
          summaries,
          rangeActivity,
          directionalMinted,
          directionalRedeemed,
        ] = await Promise.all([
          getManagerPositionSummaries(manager.manager_id),
          getManagerRanges(manager.manager_id),
          getDirectionalPositionMints(
            DIRECTIONAL_ORDER_EVENT_LIMIT,
            market.oracleId
          ),
          getDirectionalPositionRedeems(
            DIRECTIONAL_ORDER_EVENT_LIMIT,
            market.oracleId
          ),
        ])
        const managerDirectionalMinted = directionalMinted.filter(
          (event) =>
            event.manager_id === manager.manager_id &&
            event.oracle_id === market.oracleId &&
            event.expiry === market.expiryMs
        )
        const managerDirectionalRedeemed = directionalRedeemed.filter(
          (event) =>
            event.manager_id === manager.manager_id &&
            event.oracle_id === market.oracleId &&
            event.expiry === market.expiryMs
        )
        const [hydratedDirectionalActivity, hydratedRangeActivity] =
          await Promise.all([
            hydrateDirectionalActivityOrderIds({
              minted: managerDirectionalMinted,
              redeemed: managerDirectionalRedeemed,
            }),
            hydrateRangeActivityOrderIds(rangeActivity),
          ])
        const summariesWithOrderIds = applyDirectionalActivityOrderIds({
          minted: hydratedDirectionalActivity.minted,
          redeemed: hydratedDirectionalActivity.redeemed,
          summaries,
        })
        const directionalPositions = filterPositions(summariesWithOrderIds, {
          expiryMs: market.expiryMs,
          oracleId: market.oracleId,
        })
        const rangePositions = getRangePositionsFromActivity(
          hydratedRangeActivity.minted,
          hydratedRangeActivity.redeemed,
          {
            expiryMs: market.expiryMs,
            oracleId: market.oracleId,
          }
        )
        const positions = getPositionRows(directionalPositions, rangePositions)

        if (!isStale) {
          setPositionState({
            isLoading: false,
            managerId: manager.manager_id,
            positions,
          })
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
          setPreviewState({ isLoading: false })
        }
      }
    }

    void loadPositions()

    return () => {
      isStale = true
    }
  }, [
    market.expiryMs,
    market.oracleId,
    positionRefreshNonce,
    publicActivityVersion,
    walletAddress,
  ])

  const visiblePositions = positionState.positions
  const visibleTrades = walletAddress
    ? trades.filter((trade) => isWalletTrade(trade, walletAddress))
    : []
  const visibleRedemptions = walletAddress
    ? redemptions.filter((redemption) =>
        isWalletRedemption(redemption, walletAddress)
      )
    : []
  const positionsLabel =
    !walletAddress || positionState.isLoading
      ? "Positions"
      : `Positions (${visiblePositions.length})`
  const tradesLabel = walletAddress
    ? `Trades (${visibleTrades.length})`
    : "Trades"
  const redemptionsLabel = walletAddress
    ? `Redemptions (${visibleRedemptions.length})`
    : "Redemptions"

  return (
    <ActivityTabsFrame
      positionsContent={
        <PositionsPanel
          assetSymbol={market.assetSymbol}
          errorMessage={positionState.errorMessage}
          isLoading={positionState.isLoading}
          onAddPosition={onAddPosition}
          onCancelLifecycle={() => setConfirmState({})}
          onConfirmLifecycle={executePositionLifecycle}
          onPreviewLifecycle={previewPositionLifecycle}
          onRequestLifecycle={(position) => setConfirmState({ position })}
          positions={visiblePositions}
          pendingLifecyclePosition={confirmState.position}
          previewErrorMessage={previewState.errorMessage}
          previewIsExecuting={previewState.isExecuting}
          previewIsLoading={previewState.isLoading}
          previewMessage={previewState.message}
          walletAddress={walletAddress}
        />
      }
      positionsLabel={positionsLabel}
      redemptionsContent={
        <RedemptionsPanel
          assetSymbol={market.assetSymbol}
          redemptions={visibleRedemptions}
          walletAddress={walletAddress}
        />
      }
      redemptionsLabel={redemptionsLabel}
      tradesContent={
        <TradesPanel
          assetSymbol={market.assetSymbol}
          trades={visibleTrades}
          walletAddress={walletAddress}
        />
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
  onCancelLifecycle,
  onConfirmLifecycle,
  onPreviewLifecycle,
  onRequestLifecycle,
  pendingLifecyclePosition,
  positions,
  previewErrorMessage,
  previewIsExecuting,
  previewIsLoading,
  previewMessage,
  walletAddress,
}: {
  assetSymbol: string
  errorMessage?: string
  isLoading: boolean
  onAddPosition: (intent: AddPositionIntent) => void
  onCancelLifecycle: () => void
  onConfirmLifecycle: (position: PositionRow) => void
  onPreviewLifecycle: (position: PositionRow) => void
  onRequestLifecycle: (position: PositionRow) => void
  pendingLifecyclePosition?: PositionRow
  positions: PositionRow[]
  previewErrorMessage?: string
  previewIsExecuting?: boolean
  previewIsLoading: boolean
  previewMessage?: string
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
          className={cn(
            "mb-2 shrink-0 rounded-md px-3 py-2 text-xs leading-5",
            previewErrorMessage
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          )}
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
        <PositionsTable
          assetSymbol={assetSymbol}
          onAddPosition={onAddPosition}
          onPreviewLifecycle={onPreviewLifecycle}
          onRequestLifecycle={onRequestLifecycle}
          positions={positions}
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
  const orderId = position.orderIds[0]

  return (
    <div className="mb-2 flex shrink-0 flex-col gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-primary sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="font-medium">Confirm {actionLabel.toLowerCase()}</div>
        <div className="truncate font-mono text-[10px] text-primary/80">
          {getPositionContract(position, assetSymbol)} ·{" "}
          {formatPositionQuantity(position.openQuantity)} contracts · order{" "}
          {orderId}
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
  onPreviewLifecycle,
  onRequestLifecycle,
  positions,
}: {
  assetSymbol: string
  onAddPosition: (intent: AddPositionIntent) => void
  onPreviewLifecycle: (position: PositionRow) => void
  onRequestLifecycle: (position: PositionRow) => void
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
                onPreviewLifecycle={onPreviewLifecycle}
                onRequestLifecycle={onRequestLifecycle}
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
  onPreviewLifecycle,
  onRequestLifecycle,
  position,
}: {
  onAddPosition: (intent: AddPositionIntent) => void
  onPreviewLifecycle: (position: PositionRow) => void
  onRequestLifecycle: (position: PositionRow) => void
  position: PositionRow
}) {
  const primaryActionLabel = getPositionActionLabel(position)
  const addLabel =
    position.kind === "range" ? "Add to range" : "Add to position"
  const lifecycleActionLabel = getPositionLifecycleActionLabel(position)
  const disabledReason =
    position.orderIds.length > 0
      ? "Wallet approval required"
      : "Requires order-level data"

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
          {position.orderIds.length > 0 ? (
            <>
              <DropdownMenuItem onClick={() => onPreviewLifecycle(position)}>
                Preview {lifecycleActionLabel.toLowerCase()}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRequestLifecycle(position)}>
                Confirm {lifecycleActionLabel.toLowerCase()}
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem disabled>{lifecycleActionLabel}</DropdownMenuItem>
          )}
          <DropdownMenuLabel className="px-2 py-1 text-[11px] leading-4 font-normal">
            {disabledReason}
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
  walletAddress,
}: {
  assetSymbol: string
  trades: TradeActivityRow[]
  walletAddress?: string
}) {
  if (!walletAddress) {
    return <EmptyState message="Connect wallet to view your trades." />
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      {trades.length > 0 ? (
        <TradesTable assetSymbol={assetSymbol} trades={trades} />
      ) : (
        <EmptyState message="No trades for this market from your wallet." />
      )}
    </div>
  )
}

function RedemptionsPanel({
  assetSymbol,
  redemptions,
  walletAddress,
}: {
  assetSymbol: string
  redemptions: RedemptionActivityRow[]
  walletAddress?: string
}) {
  if (!walletAddress) {
    return <EmptyState message="Connect wallet to view your redemptions." />
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      {redemptions.length > 0 ? (
        <RedemptionsTable assetSymbol={assetSymbol} redemptions={redemptions} />
      ) : (
        <EmptyState message="No redemptions for this market from your wallet." />
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
