import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState } from "react"

import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { usePredictAccount } from "@/lib/providers/predict-account"
import type { OracleInfo, VaultSummary } from "@/lib/types/predict"
import { loadManagerPredictPositions } from "@/lib/predict-position-source"
import { formatPredictLifecycleError } from "@/services/predict-quotes"
import {
  buildManagerWithdrawTransaction,
  buildPredictRedeemTransaction,
  executeSuiTransaction,
  simulatePredictRedeemTransaction,
} from "@/services/predict-transactions"
import {
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
} from "@/services/predict-client"
import { getShieldPositions } from "@/services/shield-client"
import {
  REALIZED_ACTIVITY_LIMIT,
  getFilteredPositions,
  getManagerDusdcBalance,
  getOracleById,
  getPortfolioPositions,
  getPortfolioRedeemParams,
  getPortfolioSummary,
  getRealizedPnlChartData,
  getPositionLifecycleActionLabel,
  getReservedPositionIds,
} from "./helpers"
import type {
  PortfolioPosition,
  PortfolioState,
  PortfolioTab,
  RedeemState,
} from "./helpers"

export function usePortfolio(
  oracles: OracleInfo[],
  vaultSummary: VaultSummary
) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const predictAccount = usePredictAccount()
  const refreshRoute = useAppRouteRefresh()
  const [portfolioState, setPortfolioState] = useState<PortfolioState>({
    dusdcBalance: 0n,
    isLoading: false,
    plpBalance: 0n,
    positions: [],
    realizedPnlPoints: [],
  })
  const [activeTab, setActiveTab] = useState<PortfolioTab>("open")
  const [positionRefreshNonce, setPositionRefreshNonce] = useState(0)
  const [redeemState, setRedeemState] = useState<RedeemState>({})
  const [searchQuery, setSearchQuery] = useState("")
  const walletAddress = primaryWallet?.address
  const managerId = predictAccount.managerId
  const managerSummary = predictAccount.managerSummary
  const dusdcBalance = predictAccount.walletDusdcBalance ?? 0n
  const plpBalance = predictAccount.walletPlpBalance ?? 0n
  const oracleById = getOracleById(oracles)
  const summary = getPortfolioSummary({
    dusdcBalance: portfolioState.dusdcBalance,
    plpBalance: portfolioState.plpBalance,
    positions: portfolioState.positions,
    realizedPnlPoints: portfolioState.realizedPnlPoints,
    vaultSummary,
  })
  const filteredPositions = getFilteredPositions({
    positions: portfolioState.positions,
    searchQuery,
    tab: activeTab,
  })

  useEffect(() => {
    let isStale = false

    async function loadPortfolio() {
      if (!walletAddress) {
        setPortfolioState({
          dusdcBalance: 0n,
          isLoading: false,
          plpBalance: 0n,
          positions: [],
          realizedPnlPoints: [],
        })
        return
      }

      if (predictAccount.status === "loading" && !managerId) {
        setPortfolioState((currentState) => ({
          ...currentState,
          dusdcBalance,
          errorMessage: undefined,
          isLoading: true,
          managerId: undefined,
          managerSummary: undefined,
          plpBalance,
          positions: [],
          realizedPnlPoints: [],
        }))
        return
      }

      setPortfolioState((currentState) => ({
        ...currentState,
        dusdcBalance,
        errorMessage: undefined,
        isLoading: Boolean(managerId),
        managerId,
        managerSummary,
        plpBalance,
      }))

      if (!managerId) {
        setPortfolioState((currentState) => ({
          ...currentState,
          dusdcBalance,
          isLoading: false,
          managerId: undefined,
          managerSummary: undefined,
          plpBalance,
          positions: [],
          realizedPnlPoints: [],
        }))
        return
      }

      try {
        const [
          positionSource,
          directionalMinted,
          directionalRedeemed,
          shieldPositions,
        ] = await Promise.all([
          loadManagerPredictPositions({
            managerId,
            oracleById: getOracleById(oracles),
          }),
          getDirectionalPositionMints(REALIZED_ACTIVITY_LIMIT).catch(() => []),
          getDirectionalPositionRedeems(REALIZED_ACTIVITY_LIMIT).catch(
            () => []
          ),
          getShieldPositions(walletAddress).catch(() => []),
        ])

        const currentOracleById = getOracleById(oracles)
        const reservedPositionIds = getReservedPositionIds(
          positionSource.summaries,
          shieldPositions
        )

        if (!isStale) {
          setPortfolioState({
            dusdcBalance,
            isLoading: false,
            managerId,
            managerSummary,
            plpBalance,
            positions: getPortfolioPositions({
              oracleById: currentOracleById,
              positions: positionSource.rows,
              reservedPositionIds,
            }),
            realizedPnlPoints: getRealizedPnlChartData({
              directionalMinted: directionalMinted.filter(
                (event) => event.manager_id === managerId
              ),
              directionalRedeemed: directionalRedeemed.filter(
                (event) => event.manager_id === managerId
              ),
              oracleById: currentOracleById,
              rangeActivity: positionSource.rangeActivity,
            }),
          })
        }
      } catch (error) {
        if (!isStale) {
          setPortfolioState((currentState) => ({
            ...currentState,
            errorMessage:
              error instanceof Error
                ? error.message
                : "Failed to load portfolio.",
            isLoading: false,
          }))
        }
      }
    }

    void loadPortfolio()

    return () => {
      isStale = true
    }
  }, [
    dusdcBalance,
    managerId,
    managerSummary,
    oracles,
    plpBalance,
    positionRefreshNonce,
    predictAccount.status,
    walletAddress,
  ])

  const [isClaiming, setIsClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | undefined>(undefined)

  // Sweep any free DUSDC sitting in the manager (redemption proceeds, trade
  // leftovers) back to the wallet. The amount is the known manager balance, so
  // there's no withdraw-all guesswork.
  async function handleClaim() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const managerBalance = getManagerDusdcBalance(managerSummary)

    if (!managerId || managerBalance <= 0n) {
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setClaimError(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    setIsClaiming(true)
    setClaimError(undefined)

    try {
      await executeSuiTransaction(
        signer,
        buildManagerWithdrawTransaction({
          amount: managerBalance,
          managerId,
          walletAddress,
        })
      )
      void predictAccount.refreshAccount()
      setPositionRefreshNonce((current) => current + 1)
    } catch (error) {
      setClaimError(
        error instanceof Error ? error.message : "Failed to claim DUSDC."
      )
    } finally {
      setIsClaiming(false)
    }
  }

  async function handleRedeemPosition(position: PortfolioPosition) {
    const actionLabel = getPositionLifecycleActionLabel(position)

    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setRedeemState({
        errorMessage: RECONNECT_SUI_WALLET_MESSAGE,
        positionId: position.id,
      })
      setShowAuthFlow(true)
      return
    }

    if (!managerId) {
      setRedeemState({
        errorMessage: "Could not resolve portfolio.",
        positionId: position.id,
      })
      return
    }

    const params = getPortfolioRedeemParams({ position, walletAddress })

    if (!params) {
      setRedeemState({
        errorMessage: `Could not prepare ${actionLabel.toLowerCase()}.`,
        positionId: position.id,
      })
      return
    }

    setRedeemState({ positionId: position.id })

    try {
      await simulatePredictRedeemTransaction({
        managerId,
        params,
      })

      await executeSuiTransaction(
        signer,
        buildPredictRedeemTransaction({
          managerId,
          params,
        })
      )

      setRedeemState({})
      void predictAccount.refreshAccount()
      setPositionRefreshNonce((current) => current + 1)
      refreshRoute()
      window.setTimeout(refreshRoute, 1_500)
    } catch (error) {
      setRedeemState({
        errorMessage: formatPredictLifecycleError(
          error,
          `${actionLabel} failed.`
        ),
        positionId: position.id,
      })
    }
  }

  return {
    activeTab,
    claimError,
    filteredPositions,
    handleClaim,
    handleRedeemPosition,
    isClaiming,
    managerSummary,
    oracleById,
    portfolioState,
    positionRefreshNonce,
    redeemState,
    searchQuery,
    summary,
    walletAddress,
    setActiveTab,
    setSearchQuery,
  }
}
