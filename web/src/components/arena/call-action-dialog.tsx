import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState } from "react"

import { TicketMessage } from "@/components/shared/ticket/ticket"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PanelRow } from "@/components/primitives/panel-row"
import { formatUnitPrice, parseDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { usePredictAccount } from "@/lib/providers/predict-account"
import { cn } from "@/lib/utils"
import type { ArenaCall } from "@/lib/arena/types"
import { formatDusdc, getTradeReserveAmount } from "@/lib/market-detail/helpers"
import { executeBackCall, executeFadeCall } from "@/services/arena-transactions"
import {
  formatPredictQuoteMessage,
  formatPredictTradeError,
  quotePredictTradeSafe,
} from "@/services/predict-quotes"
import type { PredictQuoteResult } from "@/services/predict-quotes"
import type { DirectionalTradeParams } from "@/services/predict-transactions"

import { oppositeMarket, percentFormatter } from "./atoms"

export type CallActionMode = "back" | "fade"

export function CallActionDialog({
  call,
  mode,
}: {
  call: ArenaCall
  mode: CallActionMode
}) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const predictAccount = usePredictAccount()
  const refreshRoute = useAppRouteRefresh()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [quote, setQuote] = useState<PredictQuoteResult>()
  const [isQuoting, setIsQuoting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>()
  const [statusKind, setStatusKind] = useState<"neutral" | "success">("neutral")
  const [errorMessage, setErrorMessage] = useState<string>()

  const isBack = mode === "back"
  // Back takes the call's side; fade takes the opposite.
  const isUp = isBack ? call.direction === "up" : call.direction !== "up"
  const market = isBack ? call.market : oppositeMarket(call.market)

  const walletAddress = primaryWallet?.address

  // Live chain ids are required to build the transaction; mock calls lack them.
  const isLiveCall = Boolean(call.callId && call.oracleId)
  const quantityUnits = parseDecimalUnits(amount, PREDICT_QUOTE_DECIMALS)

  const quotedQuote = quote?.status === "quoted" ? quote : undefined

  // Premium and max loss are the on-chain mint cost; binary payout ≈ quantity
  // (1 per contract), so profit is quantity minus what you paid.
  const pricePreview =
    quotedQuote && quantityUnits
      ? `${formatUnitPrice(quotedQuote.mintCost, quantityUnits)} DUSDC`
      : quote?.status === "no_quote"
        ? "No quote"
        : isQuoting
          ? "Quoting…"
          : "—"
  const premiumPreview = quotedQuote ? formatDusdc(quotedQuote.mintCost) : "—"
  const profitPreview =
    quotedQuote && quantityUnits
      ? formatDusdc(
          quantityUnits > quotedQuote.mintCost
            ? quantityUnits - quotedQuote.mintCost
            : 0n
        )
      : "—"

  // Quote-implied probability (0..1): the share of the payout you pay upfront.
  const impliedChance =
    quotedQuote && quantityUnits
      ? Number(quotedQuote.mintCost) / Number(quantityUnits)
      : undefined

  const guardMessage = !isLiveCall
    ? "Preview data. Backing and fading need the deployed Arena."
    : undefined

  const isActionDisabled =
    isSubmitting ||
    !isLiveCall ||
    isQuoting ||
    predictAccount.isCreatingManager ||
    (!!walletAddress && (!quantityUnits || !quotedQuote))

  const actionLabel = !walletAddress
    ? "Connect wallet"
    : isSubmitting
      ? "Submitting"
      : isBack
        ? "Back call"
        : "Fade call"

  useEffect(() => {
    let isStale = false
    const timeoutId = window.setTimeout(() => {
      async function loadQuote() {
        if (
          !open ||
          !walletAddress ||
          !quantityUnits ||
          !isLiveCall ||
          !call.oracleId
        ) {
          setQuote(undefined)
          setIsQuoting(false)
          return
        }

        setIsQuoting(true)

        try {
          const params: DirectionalTradeParams = {
            expiryMs: call.expiryMs,
            isUp,
            kind: "binary",
            oracleId: call.oracleId,
            quantity: quantityUnits,
            strikePriceUsd: call.strikeUsd,
            walletAddress,
          }
          const nextQuote = await quotePredictTradeSafe(params)

          if (!isStale) {
            setQuote(nextQuote)
            setErrorMessage(formatPredictQuoteMessage(nextQuote))
          }
        } finally {
          if (!isStale) {
            setIsQuoting(false)
          }
        }
      }

      void loadQuote()
    }, 350)

    return () => {
      isStale = true
      window.clearTimeout(timeoutId)
    }
  }, [
    call.expiryMs,
    call.oracleId,
    call.strikeUsd,
    isLiveCall,
    isUp,
    open,
    quantityUnits,
    walletAddress,
  ])

  function resetState() {
    setStatusMessage(undefined)
    setStatusKind("neutral")
    setErrorMessage(undefined)
  }

  async function handleSubmit() {
    resetState()

    if (!isLiveCall || !call.callId || !call.oracleId) {
      setErrorMessage(guardMessage)
      return
    }

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

    if (!quantityUnits) {
      setErrorMessage("Enter a positive number of contracts.")
      return
    }

    if (!quotedQuote) {
      setErrorMessage("Wait for an executable quote")
      return
    }

    setIsSubmitting(true)

    try {
      const hadManager = Boolean(predictAccount.managerId)

      if (!hadManager) {
        setStatusMessage("Creating trading account")
      }

      const managerId = await predictAccount.ensureManager(signer)

      // The on-chain quote adds spread, so we send a buffered payment above the
      // mint cost and let the contract refund the unspent remainder.
      const paymentAmount = getTradeReserveAmount(quotedQuote.mintCost)

      setStatusMessage(isBack ? "Backing call" : "Fading call")

      const execute = isBack ? executeBackCall : executeFadeCall

      await execute(
        {
          callId: call.callId,
          managerId,
          oracleId: call.oracleId,
          paymentAmount,
          quantity: quantityUnits,
          walletAddress,
        },
        signer
      )

      setStatusMessage(isBack ? "Backed" : "Faded")
      setStatusKind("success")
      void predictAccount.refreshAccount()
      refreshRoute()
      window.setTimeout(() => {
        setOpen(false)
      }, 900)
    } catch (error) {
      setStatusMessage(undefined)
      setStatusKind("neutral")
      setErrorMessage(
        formatPredictTradeError(error, isBack ? "Back failed" : "Fade failed")
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)

        if (!nextOpen) {
          resetState()
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button
            className={cn(
              "shadow-none",
              isBack
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : "bg-muted/40 text-foreground hover:bg-muted/55"
            )}
            size="sm"
            type="button"
            variant="ghost"
          />
        }
      >
        {isBack ? "Back" : "Fade"}
      </DialogTrigger>
      <DialogContent className="gap-5 rounded-md border-0 bg-card p-5 shadow-none ring-0 sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
            {isBack ? "Back this call" : "Fade this call"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {isBack ? "Take the same side as " : "Take the opposite side of "}
            <span className="text-foreground">{call.creatorHandle}</span>. Opens
            a native Predict position.
          </p>
        </DialogHeader>

        <div className="rounded-md border border-border/35 bg-muted/25 px-3 py-2.5">
          <div className="text-sm font-medium text-foreground">{market}</div>
          {impliedChance !== undefined && (
            <div className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">
                {percentFormatter.format(impliedChance)}
              </span>{" "}
              chance
            </div>
          )}
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            Contracts
          </span>
          <div className="relative">
            <Input
              className="border-border/35 bg-muted/25 pr-20 font-mono text-sm shadow-none ring-0 transition-[background-color,border-color,color] duration-150 hover:bg-muted/30 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              value={amount}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
              Contracts
            </span>
          </div>
        </label>

        <div className="space-y-2.5 rounded-md border border-border/35 bg-muted/25 px-3 py-3">
          <PanelRow label="Price" value={pricePreview} />
          <PanelRow label="Premium" value={premiumPreview} />
          <PanelRow label="Max loss" value={premiumPreview} />
          <PanelRow label="Potential profit" value={profitPreview} />
        </div>

        {(errorMessage || statusMessage || guardMessage) && (
          <TicketMessage
            kind={
              errorMessage
                ? "error"
                : statusKind === "success"
                  ? "success"
                  : "neutral"
            }
          >
            {errorMessage ?? statusMessage ?? guardMessage}
          </TicketMessage>
        )}

        <DialogFooter>
          <Button
            className="w-full active:scale-[0.98]"
            disabled={isActionDisabled}
            onClick={handleSubmit}
            size="lg"
            type="button"
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
