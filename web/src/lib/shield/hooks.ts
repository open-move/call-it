import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState } from "react"

import { formatDecimalUnits, parseDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import type { ShieldProduct } from "@/lib/types/shield"
import { formatPredictTradeError } from "@/services/predict-quotes"
import { executeSuiTransaction } from "@/services/predict-transactions"
import {
  getHedgedPlpStrategyState,
  getShieldWalletState,
} from "@/services/shield-client"
import type {
  HedgedPlpStrategyState,
  ShieldWalletState,
} from "@/services/shield-client"
import {
  buildHedgedPlpStrategyDepositTransaction,
  buildHedgedPlpStrategyWithdrawTransaction,
} from "@/services/shield-transactions"
import {
  getDepositQuote,
  getInvalidReason,
  getRoundProduct,
  getRoundStage,
  getVaultStatus,
  getWithdrawQuote,
} from "./helpers"
import type { ShieldAction } from "./helpers"

export function useShieldAction(products: ShieldProduct[]) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const walletAddress = primaryWallet?.address
  const refreshRoute = useAppRouteRefresh()
  const [strategy, setVault] = useState<HedgedPlpStrategyState | undefined>()
  const [wallet, setWallet] = useState<ShieldWalletState | undefined>()
  const [isLoadingVault, setIsLoadingVault] = useState(true)
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)
  const [action, setAction] = useState<ShieldAction>("deposit")
  const [dialogAction, setDialogAction] = useState<ShieldAction>()
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState<string | undefined>()
  const [messageTone, setMessageTone] = useState<"error" | "muted">("muted")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const parsedAmount = parseDecimalUnits(amount, PREDICT_QUOTE_DECIMALS)
  const depositQuote = getDepositQuote(parsedAmount, strategy)
  const withdrawQuote = getWithdrawQuote(parsedAmount, strategy)
  const status = getVaultStatus(strategy)
  const roundProduct = getRoundProduct(strategy, products)
  const canUseVault = !!strategy && !strategy.paused && !strategy.activeRound
  const activeStep = getRoundStage(strategy)
  const actionBalance =
    action === "deposit" ? wallet?.dusdcBalance : wallet?.hedgedPlpShareBalance
  const canSubmit =
    !!walletAddress &&
    canUseVault &&
    !!parsedAmount &&
    actionBalance !== undefined &&
    parsedAmount <= actionBalance
  const invalidReason = getInvalidReason({
    action,
    actionBalance,
    canUseVault,
    isLoadingWallet,
    parsedAmount,
    status,
    strategy,
    walletAddress,
  })

  async function refreshVault() {
    setIsLoadingVault(true)

    try {
      const nextVault = await getHedgedPlpStrategyState()

      setVault(nextVault)
      setMessage(undefined)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to load Shield"
      )
      setMessageTone("error")
    } finally {
      setIsLoadingVault(false)
    }
  }

  async function refreshWallet(address: string) {
    setIsLoadingWallet(true)

    try {
      setWallet(await getShieldWalletState(address))
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to load wallet balances"
      )
      setMessageTone("error")
    } finally {
      setIsLoadingWallet(false)
    }
  }

  useEffect(() => {
    void refreshVault()
  }, [])

  useEffect(() => {
    if (!walletAddress) {
      setWallet(undefined)
      return
    }

    void refreshWallet(walletAddress)
  }, [walletAddress])

  async function refreshAll() {
    await refreshVault()

    if (walletAddress) {
      await refreshWallet(walletAddress)
    }
  }

  function handleMaxAmount() {
    const maxAmount =
      action === "deposit"
        ? (wallet?.dusdcBalance ?? 0n)
        : (wallet?.hedgedPlpShareBalance ?? 0n)

    setAmount(formatDecimalUnits(maxAmount, PREDICT_QUOTE_DECIMALS))
    setMessage(undefined)
  }

  function openActionDialog(nextAction: ShieldAction) {
    setAction(nextAction)
    setDialogAction(nextAction)
    setAmount("")
    setMessage(undefined)
    setMessageTone("muted")
  }

  function handleDialogOpenChange(open: boolean) {
    if (open) {
      return
    }

    setDialogAction(undefined)
    setAmount("")
    setMessage(undefined)
    setMessageTone("muted")
  }

  async function handleSubmit() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setMessage(RECONNECT_SUI_WALLET_MESSAGE)
      setMessageTone("error")
      setShowAuthFlow(true)
      return
    }

    if (!canSubmit || !parsedAmount) {
      setMessage(invalidReason ?? "Enter a valid amount")
      setMessageTone("error")
      return
    }

    setIsSubmitting(true)
    setMessage(
      action === "deposit" ? "Preparing deposit" : "Preparing withdrawal"
    )
    setMessageTone("muted")

    try {
      const transaction =
        action === "deposit"
          ? await buildHedgedPlpStrategyDepositTransaction({
              amount: parsedAmount,
              walletAddress,
            })
          : await buildHedgedPlpStrategyWithdrawTransaction({
              amount: parsedAmount,
              walletAddress,
            })

      setMessage(
        action === "deposit" ? "Depositing DUSDC" : "Withdrawing DUSDC"
      )
      await executeSuiTransaction(signer, transaction)
      setMessage(
        action === "deposit" ? "Deposit confirmed" : "Withdrawal confirmed"
      )
      setAmount("")
      setDialogAction(undefined)
      await refreshAll()
      refreshRoute()
      window.setTimeout(refreshRoute, 1_500)
    } catch (error) {
      setMessage(formatPredictTradeError(error, "Shield transaction failed"))
      setMessageTone("error")
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    action,
    amount,
    dialogOpen: dialogAction !== undefined,
    strategy,
    wallet,
    isLoadingVault,
    isLoadingWallet,
    isSubmitting,
    status,
    activeStep,
    roundProduct,
    canUseVault,
    actionBalance,
    canSubmit,
    depositQuote,
    withdrawQuote,
    invalidReason,
    message,
    messageTone,
    walletAddress,
    setAction,
    setAmount,
    handleSubmit,
    handleMaxAmount,
    openActionDialog,
    handleDialogOpenChange,
  }
}
