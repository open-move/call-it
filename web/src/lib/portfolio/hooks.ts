import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState } from "react"

import { formatDecimalUnits, parseDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
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
  buildManagerDepositTransaction,
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
  TradingAccountModalMode,
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
  const [createManagerError, setCreateManagerError] = useState<string>()
  const [depositAmount, setDepositAmount] = useState("")
  const [depositError, setDepositError] = useState<string>()
  const [depositStatusMessage, setDepositStatusMessage] = useState<string>()
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawError, setWithdrawError] = useState<string>()
  const [withdrawStatusMessage, setWithdrawStatusMessage] = useState<string>()
  const [isDepositing, setIsDepositing] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [tradingAccountModalMode, setTradingAccountModalMode] =
    useState<TradingAccountModalMode | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const walletAddress = primaryWallet?.address
  const managerId = predictAccount.managerId
  const managerSummary = predictAccount.managerSummary
  const dusdcBalance = predictAccount.walletDusdcBalance ?? 0n
  const plpBalance = predictAccount.walletPlpBalance ?? 0n
  const parsedDepositAmount = parseDecimalUnits(
    depositAmount,
    PREDICT_QUOTE_DECIMALS
  )
  const parsedWithdrawAmount = parseDecimalUnits(
    withdrawAmount,
    PREDICT_QUOTE_DECIMALS
  )
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
      setCreateManagerError(undefined)
      setDepositError(undefined)
      setWithdrawError(undefined)

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

  function resetTradingAccountState() {
    setCreateManagerError(undefined)
    setDepositAmount("")
    setDepositError(undefined)
    setDepositStatusMessage(undefined)
    setWithdrawAmount("")
    setWithdrawError(undefined)
    setWithdrawStatusMessage(undefined)
  }

  async function handleCreateTradingAccount() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setCreateManagerError(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    setCreateManagerError(undefined)

    try {
      const createdManagerId = await predictAccount.ensureManager(signer)

      setPortfolioState((currentState) => ({
        ...currentState,
        managerId: createdManagerId,
      }))
      setTradingAccountModalMode("deposit")
      void predictAccount.refreshAccount()
      setPositionRefreshNonce((current) => current + 1)
    } catch (error) {
      setCreateManagerError(
        error instanceof Error
          ? error.message
          : "Failed to initialize portfolio."
      )
    }
  }

  async function handleDepositToTradingAccount() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    if (!managerId) {
      setDepositError(
        predictAccount.status === "loading"
          ? "Preparing portfolio. Try again in a moment."
          : "Initialize portfolio first."
      )
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setDepositError(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    if (!parsedDepositAmount) {
      setDepositError("Enter a positive deposit amount")
      return
    }

    if (parsedDepositAmount > dusdcBalance) {
      setDepositError("Deposit amount exceeds wallet DUSDC balance")
      return
    }

    setIsDepositing(true)
    setDepositError(undefined)
    setDepositStatusMessage("Submitting deposit")

    try {
      const transaction = await buildManagerDepositTransaction({
        amount: parsedDepositAmount,
        managerId,
        walletAddress,
      })

      await executeSuiTransaction(signer, transaction)
      resetTradingAccountState()
      setTradingAccountModalMode(null)
      void predictAccount.refreshAccount()
      setPositionRefreshNonce((current) => current + 1)
    } catch (error) {
      setDepositStatusMessage(undefined)
      setDepositError(
        error instanceof Error ? error.message : "Failed to deposit DUSDC."
      )
    } finally {
      setIsDepositing(false)
    }
  }

  async function handleWithdrawFromTradingAccount() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    if (!managerId) {
      setWithdrawError(
        predictAccount.status === "loading"
          ? "Preparing portfolio. Try again in a moment."
          : "Initialize portfolio first."
      )
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setWithdrawError(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    if (!parsedWithdrawAmount) {
      setWithdrawError("Enter a positive withdrawal amount")
      return
    }

    const managerBalance = getManagerDusdcBalance(managerSummary)

    if (parsedWithdrawAmount > managerBalance) {
      setWithdrawError("Withdrawal amount exceeds available DUSDC")
      return
    }

    setIsWithdrawing(true)
    setWithdrawError(undefined)
    setWithdrawStatusMessage("Submitting withdrawal")

    try {
      const transaction = buildManagerWithdrawTransaction({
        amount: parsedWithdrawAmount,
        managerId,
        walletAddress,
      })

      await executeSuiTransaction(signer, transaction)
      resetTradingAccountState()
      setTradingAccountModalMode(null)
      void predictAccount.refreshAccount()
      setPositionRefreshNonce((current) => current + 1)
    } catch (error) {
      setWithdrawStatusMessage(undefined)
      setWithdrawError(
        error instanceof Error ? error.message : "Failed to withdraw DUSDC."
      )
    } finally {
      setIsWithdrawing(false)
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
    createManagerError,
    depositAmount,
    depositError,
    depositStatusMessage,
    filteredPositions,
    isCreatingManager: predictAccount.isCreatingManager,
    isDepositing,
    isLoadingAccount: predictAccount.status === "loading",
    isWithdrawing,
    managerId,
    managerSummary,
    oracleById,
    portfolioState,
    positionRefreshNonce,
    redeemState,
    searchQuery,
    summary,
    tradingAccountModalMode,
    walletAddress,
    withdrawAmount,
    withdrawError,
    withdrawStatusMessage,
    setActiveTab,
    setDepositAmount,
    setSearchQuery,
    setWithdrawAmount,
    setTradingAccountModalMode,
    resetTradingAccountState,
    handleCreateTradingAccount,
    handleDepositToTradingAccount,
    handleWithdrawFromTradingAccount,
    handleRedeemPosition,
  }
}
