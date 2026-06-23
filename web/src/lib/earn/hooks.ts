import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useState } from "react"

import { formatDecimalUnits, parseDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { usePredictAccount } from "@/lib/providers/predict-account"
import {
  buildSupplyLiquidityTransaction,
  buildWithdrawLiquidityTransaction,
  executeSuiTransaction,
} from "@/services/predict-transactions"
import { formatPredictTradeError } from "@/services/predict-quotes"
import type { VaultSummary } from "@/lib/types/predict"
import {
  getEstimatedOutput,
  getEstimatedWithdrawAmount,
  getEarnInvalidReason,
  getMaxWithdrawShares,
  minBigInt,
} from "./quote"
import type { EarnAction, WalletBalances } from "./quote"
import { formatUsd, formatWalletAmount, formatWalletUsd } from "./format"

export function useEarnAction(summary: VaultSummary) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const predictAccount = usePredictAccount()
  const refreshRoute = useAppRouteRefresh()

  const [action, setAction] = useState<EarnAction>("supply")
  const [amount, setAmount] = useState("")
  const [dialogAction, setDialogAction] = useState<EarnAction>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>()
  const [errorMessage, setErrorMessage] = useState<string>()

  const walletAddress = primaryWallet?.address
  const balances: WalletBalances | undefined = walletAddress
    ? {
        dusdc: predictAccount.walletDusdcBalance ?? 0n,
        plp: predictAccount.walletPlpBalance ?? 0n,
      }
    : undefined
  const isLoadingBalances =
    Boolean(walletAddress) && predictAccount.status === "loading"
  const selectedAmount = parseDecimalUnits(amount, PREDICT_QUOTE_DECIMALS)
  const estimatedOutput = getEstimatedOutput({ action, amount, summary })
  const estimatedWithdrawAmount = selectedAmount
    ? getEstimatedWithdrawAmount(selectedAmount, summary)
    : undefined
  const canSupply =
    action === "supply" &&
    !!selectedAmount &&
    !!balances &&
    summary.plp_share_price > 0 &&
    selectedAmount <= balances.dusdc
  const canWithdraw =
    action === "withdraw" &&
    !!selectedAmount &&
    !!balances &&
    selectedAmount <= balances.plp &&
    !!estimatedWithdrawAmount &&
    estimatedWithdrawAmount <= BigInt(Math.floor(summary.available_withdrawal))
  const canSubmit = action === "supply" ? canSupply : canWithdraw
  const buttonDisabled =
    isSubmitting || isLoadingBalances || (!!walletAddress && !canSubmit)
  const buttonLabel = !walletAddress
    ? "Connect wallet"
    : isSubmitting
      ? action === "supply"
        ? "Depositing"
        : "Withdrawing"
      : action === "supply"
        ? "Deposit DUSDC"
        : "Withdraw PLP"

  const plpBalance = balances?.plp ?? 0n
  const dusdcBalance = balances?.dusdc ?? 0n
  const plpValue =
    (Number(plpBalance) / 10 ** PREDICT_QUOTE_DECIMALS) *
    summary.plp_share_price
  const dusdcBalanceValue = balances ? formatWalletUsd(dusdcBalance) : "--"
  const plpBalanceValue = balances
    ? formatWalletAmount(plpBalance, "PLP")
    : "--"
  const plpValueLabel = balances ? formatUsd(plpValue) : "--"
  const actionBalanceLabel =
    action === "supply" ? "DUSDC balance" : "PLP balance"
  const actionBalanceValue =
    action === "supply" ? dusdcBalanceValue : plpBalanceValue
  const invalidReason =
    dialogAction && buttonDisabled && !isSubmitting
      ? getEarnInvalidReason({
          action,
          balances,
          estimatedWithdrawAmount,
          isLoadingBalances,
          selectedAmount,
          summary,
        })
      : undefined

  async function handleSubmit() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setErrorMessage(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    if (!selectedAmount) {
      setErrorMessage("Enter a positive amount.")
      return
    }

    if (action === "supply" && balances && selectedAmount > balances.dusdc) {
      setErrorMessage("Deposit exceeds wallet DUSDC.")
      return
    }

    if (action === "supply" && summary.plp_share_price <= 0) {
      setErrorMessage("PLP share price is unavailable.")
      return
    }

    if (action === "withdraw") {
      if (balances && selectedAmount > balances.plp) {
        setErrorMessage("Withdrawal exceeds wallet PLP.")
        return
      }

      if (
        estimatedWithdrawAmount &&
        estimatedWithdrawAmount >
          BigInt(Math.floor(summary.available_withdrawal))
      ) {
        setErrorMessage("Withdrawal exceeds strategy withdrawable DUSDC.")
        return
      }
    }

    setIsSubmitting(true)
    setErrorMessage(undefined)

    try {
      setStatusMessage(
        action === "supply" ? "Preparing deposit" : "Preparing withdrawal"
      )
      const transaction =
        action === "supply"
          ? await buildSupplyLiquidityTransaction({
              amount: selectedAmount,
              walletAddress,
            })
          : await buildWithdrawLiquidityTransaction({
              amount: selectedAmount,
              walletAddress,
            })

      setStatusMessage(
        action === "supply" ? "Depositing DUSDC" : "Withdrawing DUSDC"
      )
      await executeSuiTransaction(signer, transaction)
      setStatusMessage(
        action === "supply" ? "Deposit confirmed" : "Withdrawal confirmed"
      )
      setAmount("")
      setDialogAction(undefined)
      await predictAccount.refreshAccount()
      refreshRoute()
      window.setTimeout(refreshRoute, 1_500)
    } catch (error) {
      setStatusMessage(undefined)
      setErrorMessage(formatPredictTradeError(error, "Transaction failed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleMaxAmount() {
    if (!balances) {
      return
    }

    const maxAmount =
      action === "supply"
        ? balances.dusdc
        : minBigInt(balances.plp, getMaxWithdrawShares(summary))

    setAmount(formatDecimalUnits(maxAmount, PREDICT_QUOTE_DECIMALS))
    setErrorMessage(undefined)
  }

  function openActionDialog(nextAction: EarnAction) {
    setAction(nextAction)
    setDialogAction(nextAction)
    setAmount("")
    setErrorMessage(undefined)
    setStatusMessage(undefined)
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) {
      setDialogAction(undefined)
      setAmount("")
      setErrorMessage(undefined)
      setStatusMessage(undefined)
    }
  }

  return {
    action,
    amount,
    connect: () => setShowAuthFlow(true),
    dialogOpen: dialogAction !== undefined,
    isSubmitting,
    isConnected: !!walletAddress,
    walletAddress,
    buttonDisabled,
    buttonLabel,
    estimatedOutput,
    invalidReason,
    message: errorMessage ?? statusMessage,
    messageTone: errorMessage ? ("error" as const) : ("muted" as const),
    dusdcBalanceValue,
    plpBalanceValue,
    plpValueLabel,
    actionBalanceLabel,
    actionBalanceValue,
    handleSubmit,
    handleMaxAmount,
    openActionDialog,
    handleDialogOpenChange,
    setAction,
    setAmount,
    setErrorMessage,
    setStatusMessage,
    setDialogAction,
  }
}
