import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState } from "react"

import { formatDecimalUnits, parseDecimalUnits } from "@/lib/amounts"
import { getReadySuiTransactionSigner, RECONNECT_SUI_WALLET_MESSAGE } from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import type { StrategyMeta } from "@/lib/strategies/registry"
import type { StrategyState, StrategyWalletState } from "@/lib/strategies/types"
import { getStrategyWalletState } from "@/services/strategy-client"
import {
  executeStrategyCancelRequest,
  executeStrategyClaimWithdrawal,
  executeStrategyDeposit,
  executeStrategyRequestWithdraw,
  executeStrategyWithdraw,
} from "@/services/strategy-transactions"

const UNIT_DECIMALS = 6

export type StrategyActionKind = "deposit" | "withdraw"
type MessageTone = "error" | "muted"

export function useStrategyAction(meta: StrategyMeta, state: StrategyState) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const address = primaryWallet?.address
  const refreshRoute = useAppRouteRefresh()

  const [wallet, setWallet] = useState<StrategyWalletState>()
  const [dialogAction, setDialogAction] = useState<StrategyActionKind>()
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState<string>()
  const [messageTone, setMessageTone] = useState<MessageTone>("muted")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function refreshWallet(owner: string) {
    try {
      setWallet(await getStrategyWalletState(meta.key, owner))
    } catch {
      // Balances are best-effort; leave prior value.
    }
  }

  useEffect(() => {
    if (!address) {
      setWallet(undefined)
      return
    }
    void refreshWallet(address)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, meta.key])

  const action = dialogAction ?? "deposit"
  const duringRound = state.round !== null
  const parsedAmount = parseDecimalUnits(amount, UNIT_DECIMALS)
  const actionBalance = action === "deposit" ? wallet?.dusdcBalance : wallet?.shareBalance

  // Estimated other-side amount for the preview.
  const depositSharesQuote =
    parsedAmount && state.nav > 0n ? (parsedAmount * state.shareSupply) / state.nav : parsedAmount
  const withdrawQuote =
    parsedAmount && state.shareSupply > 0n ? (parsedAmount * state.nav) / state.shareSupply : 0n

  const invalidReason = (() => {
    if (!address) {
      return "Connect your wallet to continue"
    }
    if (state.paused) {
      return "Strategy is paused"
    }
    if (action === "deposit" && duringRound) {
      return "Deposits open between rounds"
    }
    if (!parsedAmount) {
      return "Enter an amount"
    }
    if (actionBalance !== undefined && parsedAmount > actionBalance) {
      return "Amount exceeds your balance"
    }
    return undefined
  })()

  const canSubmit = !!address && !!parsedAmount && invalidReason === undefined

  function setMessageWith(text: string, tone: MessageTone) {
    setMessage(text)
    setMessageTone(tone)
  }

  function openDialog(next: StrategyActionKind) {
    setDialogAction(next)
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
  }

  function handleMaxAmount() {
    const max = action === "deposit" ? (wallet?.dusdcBalance ?? 0n) : (wallet?.shareBalance ?? 0n)
    setAmount(formatDecimalUnits(max, UNIT_DECIMALS))
    setMessage(undefined)
  }

  async function withSigner(run: (signer: NonNullable<Awaited<ReturnType<typeof getReadySuiTransactionSigner>>>, owner: string) => Promise<void>) {
    if (!address) {
      setShowAuthFlow(true)
      return
    }
    const signer = await getReadySuiTransactionSigner(primaryWallet)
    if (!signer) {
      setMessageWith(RECONNECT_SUI_WALLET_MESSAGE, "error")
      setShowAuthFlow(true)
      return
    }

    setIsSubmitting(true)
    try {
      await run(signer, address)
      await refreshWallet(address)
      refreshRoute()
      window.setTimeout(refreshRoute, 1_500)
    } catch (error) {
      setMessageWith(error instanceof Error ? error.message : "Transaction failed", "error")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit() {
    if (!canSubmit || !parsedAmount) {
      setMessageWith(invalidReason ?? "Enter a valid amount", "error")
      return
    }
    setMessageWith("Preparing transaction", "muted")
    await withSigner(async (signer, owner) => {
      if (action === "deposit") {
        await executeStrategyDeposit({ amount: parsedAmount, strategyKey: meta.key, walletAddress: owner }, signer)
      } else if (duringRound) {
        await executeStrategyRequestWithdraw({ shareAmount: parsedAmount, strategyKey: meta.key, walletAddress: owner }, signer)
      } else {
        await executeStrategyWithdraw({ shareAmount: parsedAmount, strategyKey: meta.key, walletAddress: owner }, signer)
      }
      setMessageWith("Confirmed", "muted")
      setAmount("")
      setDialogAction(undefined)
    })
  }

  async function handleCancelRequest() {
    setMessageWith("Cancelling request", "muted")
    await withSigner(async (signer, owner) => {
      await executeStrategyCancelRequest({ strategyKey: meta.key, walletAddress: owner }, signer)
      setMessageWith("Request cancelled", "muted")
    })
  }

  async function handleClaim() {
    setMessageWith("Claiming withdrawal", "muted")
    await withSigner(async (signer, owner) => {
      await executeStrategyClaimWithdrawal({ strategyKey: meta.key, walletAddress: owner }, signer)
      setMessageWith("Withdrawal claimed", "muted")
    })
  }

  return {
    action,
    actionBalance,
    address,
    amount,
    canSubmit,
    connect: () => setShowAuthFlow(true),
    depositSharesQuote,
    dialogOpen: dialogAction !== undefined,
    duringRound,
    handleCancelRequest,
    handleClaim,
    handleDialogOpenChange,
    handleMaxAmount,
    handleSubmit,
    invalidReason,
    isSubmitting,
    message,
    messageTone,
    openDialog,
    setAmount,
    wallet,
    withdrawQuote,
  }
}
