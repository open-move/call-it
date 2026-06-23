import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"

import { ActivityTabsFrame } from "@/components/shared/activity/activity-tabs-frame"
import { formatPredictLifecycleError } from "@/services/predict-quotes"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { usePredictAccount } from "@/lib/providers/predict-account"
import type { MarketSnapshot } from "@/lib/types/market"
import type { RedemptionActivityRow, TradeActivityRow } from "@/lib/types/trade"
import {
  executeSuiTransaction,
  buildPredictRedeemTransaction,
  simulatePredictRedeemTransaction,
} from "@/services/predict-transactions"

import { EmptyState } from "./empty-state"
import { PositionsPanel } from "./positions-panel"
import { RedemptionsPanel } from "./redemptions-panel"
import { TradesPanel } from "./trades-panel"
import {
  getPositionLifecycleActionLabel,
  getPositionRedeemParams,
  loadWalletMarketPositions,
} from "@/lib/market-detail/helpers"
import type {
  AddPositionIntent,
  ActivityTabValue,
  LoadedPositions,
  PositionConfirmState,
  PositionLoadState,
  PositionPreviewState,
} from "@/lib/market-detail/types"

export interface ActivityTabsProps {
  market: MarketSnapshot
  onAddPosition: (intent: AddPositionIntent) => void
  redemptions: RedemptionActivityRow[]
  trades: TradeActivityRow[]
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
  // Keep loaded positions on screen through refetches (after a trade/redeem or a
  // route refresh) instead of blanking to the loading state.
  const hasLoadedRef = useRef(false)
  // Control the active tab. Uncontrolled base-ui Tabs re-sync their selected
  // value against tabs that register in a layout effect; after the SSR->client
  // swap that can leave the default panel unmounted (tab highlighted, body
  // blank) until a manual click. An explicit value renders the panel at once.
  const [activeTab, setActiveTab] = useState<ActivityTabValue>("positions")
  const walletAddress = primaryWallet?.address
  const managerId = predictAccount.managerId
  const publicActivityVersion = `${trades.length}:${redemptions.length}`

  async function resolveLifecyclePosition(
    position: LoadedPositions["positions"][number]
  ) {
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

  async function requestPositionLifecycle(
    position: LoadedPositions["positions"][number]
  ) {
    const resolvedLifecycle = await resolveLifecyclePosition(position)

    if (!resolvedLifecycle) {
      return
    }

    setPreviewState({ isLoading: false })
    setConfirmState({ position: resolvedLifecycle.position })
  }

  async function executePositionLifecycle(
    position: LoadedPositions["positions"][number]
  ) {
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
        hasLoadedRef.current = false
        setPositionState({ isLoading: false, positions: [] })
        setPreviewState({ isLoading: false })
        setConfirmState({})
        return
      }

      // Only show the loading state before the first successful load; later
      // refetches keep the current rows visible until the new data arrives.
      setPositionState((currentState) => ({
        ...currentState,
        errorMessage: undefined,
        isLoading: !hasLoadedRef.current,
      }))

      try {
        const loadedPositions = await loadWalletMarketPositions({
          managerId,
          market,
        })

        if (!isStale) {
          hasLoadedRef.current = true
          setPositionState({
            isLoading: false,
            managerId: loadedPositions.managerId,
            positions: loadedPositions.positions,
          })
        }
      } catch (error) {
        if (!isStale) {
          // Keep already-loaded rows on a refetch failure; only surface a hard
          // error state on the very first load.
          setPositionState((currentState) => ({
            ...currentState,
            errorMessage:
              error instanceof Error
                ? error.message
                : "Failed to load positions",
            isLoading: false,
            positions: hasLoadedRef.current ? currentState.positions : [],
          }))
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
    ? trades.filter(
        (trade) => trade.trader.toLowerCase() === walletAddress.toLowerCase()
      )
    : []
  const visibleRedemptions = walletAddress
    ? redemptions.filter((redemption) => {
        const owner =
          redemption.kind === "directional"
            ? redemption.owner
            : redemption.trader
        return owner.toLowerCase() === walletAddress.toLowerCase()
      })
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
      onValueChange={setActiveTab}
      value={activeTab}
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
