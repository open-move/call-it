import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"

import { Button } from "@/components/ui/button"
import { ActivityTabsFrame } from "@/components/shared/activity/activity-tabs-frame"
import {
  ActivityCenteredEmptyState,
  ActivityTableHeader,
  ActivityTransactionLink,
} from "@/components/shared/activity/activity-table"
import { PositionTable } from "@/components/shared/activity/position-table"
import type { PositionTableRow } from "@/components/shared/activity/position-table"
import { formatRelativeTime, formatUsd } from "@/lib/format"
import type { MarketSnapshot } from "@/lib/types/market"
import { loadManagerPredictPositions } from "@/lib/predict-position-source"
import type {
  PositionRow,
  PositionTradeIntent,
  RedemptionActivityRow,
  TradeActivityRow,
} from "@/lib/types/trade"
import {
  buildPredictRedeemTransaction,
  executeSuiTransaction,
  simulatePredictRedeemTransaction,
} from "@/services/predict-transactions"
import type { PredictRedeemParams } from "@/services/predict-transactions"
import { formatPredictLifecycleError } from "@/services/predict-quotes"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { usePredictAccount } from "@/lib/providers/predict-account"
import { cn } from "@/lib/utils"

import { QUOTE_SCALE as POSITION_QUANTITY_SCALE } from "@/lib/config"

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

interface LoadedPositions {
  managerId?: string
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

type ActivityTabValue = "positions" | "trades" | "redemptions"
type ContractTone = "above" | "below" | "range"

interface ContractToneInput {
  kind: "directional" | "range"
  side?: "above" | "below"
}

function addressMatches(firstAddress: string, secondAddress: string) {
  return firstAddress.toLowerCase() === secondAddress.toLowerCase()
}

function formatPriceCents(price: number) {
  return `${(price * 100).toFixed(1)}c`
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

function toOnchainPositionQuantity(quantity: number) {
  return BigInt(Math.round(quantity * POSITION_QUANTITY_SCALE))
}

function formatCompactDusdc(value: number) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
    minimumFractionDigits: value >= 100 ? 0 : 2,
  })} DUSDC`
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

function getMarketOracleInfo(market: MarketSnapshot) {
  return new Map([
    [
      market.oracleId,
      {
        activated_at: null,
        created_checkpoint: 0,
        expiry: market.expiryMs,
        min_strike: 0,
        oracle_cap_id: "",
        oracle_id: market.oracleId,
        predict_id: "",
        settled_at: market.settledAtMs,
        settlement_price: market.settlementPrice,
        status: market.status,
        tick_size: 0,
        underlying_asset: market.assetSymbol,
      },
    ],
  ])
}

function getPositionLifecycleActionLabel(position: PositionRow) {
  const status = position.status.toLowerCase()

  if (status === "redeemable") {
    return "Redeem position"
  }

  if (status === "lost" || status === "liquidated") {
    return "Clear position"
  }

  return "Close position"
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
  const quantity = toOnchainPositionQuantity(position.openQuantity)

  if (quantity <= 0n) {
    return undefined
  }

  return position.kind === "directional"
    ? {
        expiryMs: market.expiryMs,
        isUp: position.side === "above",
        kind: "binary",
        oracleId: market.oracleId,
        quantity,
        strikePriceUsd: position.strikePriceUsd,
        walletAddress,
      }
    : {
        expiryMs: market.expiryMs,
        higherStrikePriceUsd: position.higherStrikePriceUsd,
        kind: "range",
        lowerStrikePriceUsd: position.lowerStrikePriceUsd,
        oracleId: market.oracleId,
        quantity,
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

function canClosePosition(position: PositionRow) {
  return canAddToPosition(position)
}

function canRedeemPosition(position: PositionRow) {
  return position.status.toLowerCase() === "redeemable"
}

function canClearPosition(position: PositionRow) {
  const status = position.status.toLowerCase()

  return status === "lost" || status === "liquidated"
}

async function loadWalletMarketPositions({
  managerId,
  market,
}: {
  managerId?: string
  market: MarketSnapshot
}): Promise<LoadedPositions> {
  if (!managerId) {
    return { positions: [] }
  }

  const loadedPositions = await loadManagerPredictPositions({
    filter: {
      expiryMs: market.expiryMs,
      oracleId: market.oracleId,
    },
    managerId,
    oracleById: getMarketOracleInfo(market),
  })

  return {
    managerId,
    positions: loadedPositions.rows,
  }
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
        cardClassName="xl:col-span-2"
        defaultValue="positions"
        tabs={
          [
            {
              content: (
                <EmptyState message="Connect wallet to view your positions." />
              ),
              contentClassName: "px-3 py-3",
              label: "Positions",
              value: "positions",
            },
            {
              content: (
                <EmptyState message="Connect wallet to view your fills." />
              ),
              contentClassName: "overflow-auto",
              label: "Fills",
              value: "trades",
            },
            {
              content: (
                <EmptyState message="Connect wallet to view your redeem activity." />
              ),
              contentClassName: "overflow-auto",
              label: "Redeems",
              value: "redemptions",
            },
          ] satisfies Array<{
            content: ReactNode
            contentClassName?: string
            label: string
            value: ActivityTabValue
          }>
        }
      />
    )
  }

  return <ActivityTabsClient {...props} />
}

function ActivityTabsClient(props: ActivityTabsProps) {
  const { market, onAddPosition, redemptions, trades } = props
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const predictAccount = usePredictAccount()
  const refreshRoute = useAppRouteRefresh()
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
  const managerId = predictAccount.managerId
  const publicActivityVersion = `${trades.length}:${redemptions.length}`

  async function resolveLifecyclePosition(position: PositionRow) {
    if (!walletAddress) {
      setPreviewState({
        errorMessage: "Connect wallet to manage this position.",
        isLoading: false,
        positionId: position.id,
      })
      return undefined
    }

    if (positionState.managerId) {
      return {
        managerId: positionState.managerId,
        position,
      }
    }

    setPreviewState({
      isLoading: true,
      message: "Resolving position.",
      positionId: position.id,
    })

    try {
      const loadedPositions = await loadWalletMarketPositions({
        managerId,
        market,
      })
      const resolvedPosition =
        loadedPositions.positions.find(
          (nextPosition) => nextPosition.id === position.id
        ) ?? position

      setPositionState({
        isLoading: false,
        managerId: loadedPositions.managerId,
        positions: loadedPositions.positions,
      })

      if (!loadedPositions.managerId) {
        setPreviewState({
          errorMessage: "Could not resolve trading account.",
          isLoading: false,
          positionId: position.id,
        })
        return undefined
      }

      return {
        managerId: loadedPositions.managerId,
        position: resolvedPosition,
      }
    } catch (error) {
      setPreviewState({
        errorMessage:
          error instanceof Error
            ? error.message
            : "Could not resolve position.",
        isLoading: false,
        positionId: position.id,
      })
      return undefined
    }
  }

  async function requestPositionLifecycle(position: PositionRow) {
    const resolvedLifecycle = await resolveLifecyclePosition(position)

    if (!resolvedLifecycle) {
      return
    }

    setPreviewState({ isLoading: false })
    setConfirmState({ position: resolvedLifecycle.position })
  }

  async function executePositionLifecycle(position: PositionRow) {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setPreviewState({
        errorMessage: RECONNECT_SUI_WALLET_MESSAGE,
        isLoading: false,
        positionId: position.id,
      })
      setShowAuthFlow(true)
      return
    }

    const resolvedLifecycle = await resolveLifecyclePosition(position)

    if (!resolvedLifecycle) {
      return
    }

    const params = getPositionRedeemParams({
      market,
      position: resolvedLifecycle.position,
      walletAddress,
    })

    if (!params) {
      setPreviewState({
        errorMessage: "This position has no redeemable quantity.",
        isLoading: false,
        positionId: position.id,
      })
      return
    }

    const actionLabel = getPositionLifecycleActionLabel(
      resolvedLifecycle.position
    )

    setConfirmState({})
    setPreviewState({
      isExecuting: true,
      isLoading: true,
      message: `Previewing ${actionLabel.toLowerCase()}.`,
      positionId: position.id,
    })

    try {
      await simulatePredictRedeemTransaction({
        managerId: resolvedLifecycle.managerId,
        params,
      })

      setPreviewState({
        isExecuting: true,
        isLoading: false,
        message: "Wallet approval requested.",
        positionId: position.id,
      })

      const result = await executeSuiTransaction(
        signer,
        buildPredictRedeemTransaction({
          managerId: resolvedLifecycle.managerId,
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
      void predictAccount.refreshAccount()
      refreshRoute()
      window.setTimeout(refreshRoute, 1_500)
    } catch (error) {
      setPreviewState({
        errorMessage: formatPredictLifecycleError(
          error,
          `${actionLabel} failed.`
        ),
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
        const loadedPositions = await loadWalletMarketPositions({
          managerId,
          market,
        })

        if (!isStale) {
          setPositionState({
            isLoading: false,
            managerId: loadedPositions.managerId,
            positions: loadedPositions.positions,
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
    managerId,
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
  const positionsTab = {
    count:
      walletAddress && !positionState.isLoading
        ? visiblePositions.length
        : undefined,
    label: "Positions",
  }
  const tradesTab = {
    count: walletAddress ? visibleTrades.length : undefined,
    label: "Fills",
  }
  const redemptionsTab = {
    count: walletAddress ? visibleRedemptions.length : undefined,
    label: "Redeems",
  }

  return (
    <ActivityTabsFrame
      cardClassName="xl:col-span-2"
      defaultValue="positions"
      tabs={[
        {
          ...positionsTab,
          content: (
            <PositionsPanel
              assetSymbol={market.assetSymbol}
              errorMessage={positionState.errorMessage}
              isLoading={positionState.isLoading}
              onAddPosition={onAddPosition}
              onCancelLifecycle={() => setConfirmState({})}
              onConfirmLifecycle={executePositionLifecycle}
              onRequestLifecycle={requestPositionLifecycle}
              positions={visiblePositions}
              pendingLifecyclePosition={confirmState.position}
              previewErrorMessage={previewState.errorMessage}
              previewIsExecuting={previewState.isExecuting}
              previewIsLoading={previewState.isLoading}
              previewMessage={previewState.message}
              walletAddress={walletAddress}
            />
          ),
          contentClassName: "px-3 py-3",
          value: "positions" as const,
        },
        {
          ...tradesTab,
          content: (
            <TradesPanel
              assetSymbol={market.assetSymbol}
              trades={visibleTrades}
              walletAddress={walletAddress}
            />
          ),
          contentClassName: "overflow-auto",
          value: "trades" as const,
        },
        {
          ...redemptionsTab,
          content: (
            <RedemptionsPanel
              assetSymbol={market.assetSymbol}
              redemptions={visibleRedemptions}
              walletAddress={walletAddress}
            />
          ),
          contentClassName: "overflow-auto",
          value: "redemptions" as const,
        },
      ]}
    />
  )
}

function EmptyState({ message }: { message: string }) {
  return <ActivityCenteredEmptyState message={message} />
}

function PositionsPanel({
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
}: {
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
}) {
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

function ActivityHeaderRow({
  className,
  columns,
}: {
  className: string
  columns: string[]
}) {
  return (
    <ActivityTableHeader
      columns={columns.map((column, index) => ({
        align: index === columns.length - 1 ? "right" : "left",
        label: column,
      }))}
      gridClassName={className}
    />
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
