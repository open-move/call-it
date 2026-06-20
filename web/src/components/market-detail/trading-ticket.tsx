import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState } from "react"

import {
  TicketCard,
  TicketMessage,
  TicketRow,
  TicketSection,
} from "@/components/shared/ticket/ticket"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList } from "@/components/ui/tabs"
import { formatUnitPrice, parseDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import {
  executeSuiTransaction,
  preparePredictMintTransaction,
} from "@/services/predict-transactions"
import {
  formatPredictTradeError,
  formatPredictQuoteMessage,
  quotePredictTradeSafe,
} from "@/services/predict-quotes"
import type { PredictQuoteResult } from "@/services/predict-quotes"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { usePredictAccount } from "@/lib/providers/predict-account"
import { getShieldPositions } from "@/services/shield-client"
import type { ShieldPositionRow } from "@/services/shield-client"
import type { MarketSnapshot } from "@/lib/types/market"
import type { PositionTradeIntent } from "@/lib/types/trade"
import { cn } from "@/lib/utils"

import { RangeSelector } from "./range-selector"
import { StrikeInput } from "./strike-input"
import { TicketModeTab } from "./ticket-mode-tab"
import {
  formatDusdc,
  formatStrikeInput,
  formatStrikeValue,
  getMarketUnavailableMessage,
  getRangeStrikeDefaults,
  getSideIcon,
  getSideLabel,
  getTradeParams,
  getTradeReserveAmount,
  isSameShieldKey,
  isTicketMode,
  normalizeStrikePrice,
  parseStrikeInput,
  pinStrikeSearchParam,
} from "@/lib/market-detail/helpers"
import type {
  ContractSide,
  RangeStrikeState,
  TicketMode,
} from "@/lib/market-detail/types"

export interface TradingTicketProps {
  initialHigherStrikePriceUsd?: number
  initialLowerStrikePriceUsd?: number
  initialMode?: TicketMode
  initialSide?: ContractSide
  market: MarketSnapshot
  onStrikeChange?: (strikePriceUsd: number) => void
  selectedStrikePriceUsd: number
  tradeIntent?: PositionTradeIntent
}

export function TradingTicket(props: TradingTicketProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <TradingTicketFallback {...props} />
  }

  return <TradingTicketClient {...props} />
}

function TradingTicketFallback(_props: TradingTicketProps) {
  return (
    <TicketCard>
      <Button className="w-full" disabled type="button">
        Sign in to trade
      </Button>
    </TicketCard>
  )
}

function TradingTicketClient({
  initialHigherStrikePriceUsd,
  initialLowerStrikePriceUsd,
  initialMode = "binary",
  initialSide = "above",
  market,
  onStrikeChange,
  selectedStrikePriceUsd,
  tradeIntent,
}: TradingTicketProps) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const predictAccount = usePredictAccount()
  const refreshRoute = useAppRouteRefresh()
  const [ticketMode, setTicketMode] = useState<TicketMode>(initialMode)
  const [contractSide, setContractSide] = useState<ContractSide>(initialSide)
  const [ticketStrikePriceUsd, setTicketStrikePriceUsd] = useState(
    selectedStrikePriceUsd
  )
  const [size, setSize] = useState("")
  const [customStrike, setCustomStrike] = useState(() =>
    formatStrikeInput(selectedStrikePriceUsd)
  )
  const [rangeStrikes, setRangeStrikes] = useState(() => {
    const defaults = getRangeStrikeDefaults(market, selectedStrikePriceUsd)

    return {
      higher:
        initialHigherStrikePriceUsd === undefined
          ? defaults.higher
          : normalizeStrikePrice(initialHigherStrikePriceUsd, market),
      lower:
        initialLowerStrikePriceUsd === undefined
          ? defaults.lower
          : normalizeStrikePrice(initialLowerStrikePriceUsd, market),
    }
  })
  const [quote, setQuote] = useState<PredictQuoteResult>()
  const [isQuoting, setIsQuoting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>()
  const [statusKind, setStatusKind] = useState<"neutral" | "success">("neutral")
  const [errorMessage, setErrorMessage] = useState<string>()
  const [shieldPositions, setShieldPositions] = useState<ShieldPositionRow[]>(
    []
  )
  const [nowMs, setNowMs] = useState(() => Date.now())
  const walletAddress = primaryWallet?.address
  const selectedQuantity = parseDecimalUnits(size, PREDICT_QUOTE_DECIMALS)
  const isAbove = contractSide === "above"
  const isRangeValid = rangeStrikes.lower < rangeStrikes.higher
  const quotedQuote = quote?.status === "quoted" ? quote : undefined
  const managerDusdcBalance = predictAccount.managerDusdcBalance ?? 0n
  const availableDusdcBalance =
    (predictAccount.walletDusdcBalance ?? 0n) + managerDusdcBalance
  const reserveAmount = quotedQuote
    ? getTradeReserveAmount(quotedQuote.mintCost)
    : undefined
  const balanceErrorMessage =
    reserveAmount !== undefined && availableDusdcBalance < reserveAmount
      ? "Available DUSDC is below the estimated trade reserve."
      : undefined
  const marketUnavailableMessage = getMarketUnavailableMessage(market, nowMs)
  const panelErrorMessage =
    marketUnavailableMessage ?? balanceErrorMessage ?? errorMessage
  const matchingShieldPosition =
    ticketMode === "binary"
      ? shieldPositions.find((position) =>
          isSameShieldKey({
            contractSide,
            market,
            position,
            strikePriceUsd: ticketStrikePriceUsd,
          })
        )
      : undefined
  const chance =
    market.fairUpProbability === undefined
      ? "--"
      : `${Math.round((isAbove ? market.fairUpProbability : 1 - market.fairUpProbability) * 100)}%`
  const quotePriceValue =
    !isRangeValid && ticketMode === "range"
      ? "Invalid range"
      : quotedQuote && selectedQuantity
        ? `${formatUnitPrice(quotedQuote.mintCost, selectedQuantity)} DUSDC`
        : quote?.status === "no_quote"
          ? "No quote"
          : isQuoting
            ? "Quoting"
            : "--"
  const premiumValue = quotedQuote ? formatDusdc(quotedQuote.mintCost) : "--"
  const maxLossValue = premiumValue
  const potentialProfitValue =
    quotedQuote && selectedQuantity
      ? formatDusdc(
          selectedQuantity > quotedQuote.mintCost
            ? selectedQuantity - quotedQuote.mintCost
            : 0n
        )
      : "--"
  const isTradeDisabled =
    isSubmitting ||
    predictAccount.status === "loading" ||
    predictAccount.isCreatingManager ||
    isQuoting ||
    !!marketUnavailableMessage ||
    !selectedQuantity ||
    !quotedQuote ||
    !!balanceErrorMessage ||
    (ticketMode === "range" && !isRangeValid)
  const actionButtonLabel = marketUnavailableMessage
    ? "Market closed"
    : !walletAddress
      ? "Sign in to trade"
      : isSubmitting
        ? "Submitting"
        : balanceErrorMessage
          ? "Insufficient DUSDC"
          : ticketMode === "range"
            ? "Open Range"
            : "Open Position"

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1_000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    let isStale = false

    async function loadShieldPositions() {
      if (!walletAddress) {
        setShieldPositions([])
        return
      }

      try {
        const nextPositions = await getShieldPositions(walletAddress)

        if (!isStale) {
          setShieldPositions(nextPositions)
        }
      } catch {
        if (!isStale) {
          setShieldPositions([])
        }
      }
    }

    void loadShieldPositions()

    return () => {
      isStale = true
    }
  }, [walletAddress])

  useEffect(() => {
    setTicketMode(initialMode)
    setContractSide(initialSide)
  }, [initialMode, initialSide, market.oracleId])

  useEffect(() => {
    const defaults = getRangeStrikeDefaults(market, selectedStrikePriceUsd)

    setRangeStrikes({
      higher:
        initialHigherStrikePriceUsd === undefined
          ? defaults.higher
          : normalizeStrikePrice(initialHigherStrikePriceUsd, market),
      lower:
        initialLowerStrikePriceUsd === undefined
          ? defaults.lower
          : normalizeStrikePrice(initialLowerStrikePriceUsd, market),
    })
  }, [
    initialHigherStrikePriceUsd,
    initialLowerStrikePriceUsd,
    market.oracleId,
    selectedStrikePriceUsd,
  ])

  useEffect(() => {
    setTicketStrikePriceUsd(selectedStrikePriceUsd)
    setCustomStrike(formatStrikeInput(selectedStrikePriceUsd))
  }, [market.oracleId, selectedStrikePriceUsd])

  function applyStrike(nextStrikePriceUsd: number) {
    const normalizedStrikePriceUsd = normalizeStrikePrice(
      nextStrikePriceUsd,
      market
    )

    setTicketStrikePriceUsd(normalizedStrikePriceUsd)
    setCustomStrike(formatStrikeInput(normalizedStrikePriceUsd))
    setQuote(undefined)
    onStrikeChange?.(normalizedStrikePriceUsd)
    pinStrikeSearchParam(normalizedStrikePriceUsd)
  }

  useEffect(() => {
    if (!tradeIntent) {
      return
    }

    setSize("")
    setQuote(undefined)
    setStatusMessage(undefined)
    setStatusKind("neutral")
    setErrorMessage(undefined)

    if (tradeIntent.kind === "range") {
      setTicketMode("range")
      const nextRangeStrikes = {
        higher: normalizeStrikePrice(tradeIntent.higherStrikePriceUsd, market),
        lower: normalizeStrikePrice(tradeIntent.lowerStrikePriceUsd, market),
      }

      setRangeStrikes(nextRangeStrikes)
      setStatusMessage(
        `Loaded ${market.assetSymbol} ${formatStrikeValue(
          nextRangeStrikes.lower,
          market.tickSizeUsd
        )}-${formatStrikeValue(nextRangeStrikes.higher, market.tickSizeUsd)} Range`
      )
      return
    }

    const nextStrikePriceUsd = normalizeStrikePrice(
      tradeIntent.strikePriceUsd,
      market
    )

    setTicketMode("binary")
    setContractSide(tradeIntent.side)
    setTicketStrikePriceUsd(nextStrikePriceUsd)
    setCustomStrike(formatStrikeInput(nextStrikePriceUsd))
    onStrikeChange?.(nextStrikePriceUsd)
    pinStrikeSearchParam(nextStrikePriceUsd)
    setStatusMessage(
      `Loaded ${market.assetSymbol} ${formatStrikeValue(
        nextStrikePriceUsd,
        market.tickSizeUsd
      )} ${getSideLabel(tradeIntent.side)}`
    )
  }, [tradeIntent?.intentId])

  useEffect(() => {
    let isStale = false
    const timeoutId = window.setTimeout(() => {
      async function loadQuote() {
        if (
          marketUnavailableMessage ||
          !walletAddress ||
          !selectedQuantity ||
          (ticketMode === "range" && !isRangeValid)
        ) {
          setQuote(undefined)
          setIsQuoting(false)
          return
        }

        setIsQuoting(true)

        try {
          const nextQuote = await quotePredictTradeSafe(
            getTradeParams({
              contractSide,
              market,
              quantity: selectedQuantity,
              rangeStrikes,
              selectedStrikePriceUsd: ticketStrikePriceUsd,
              ticketMode,
              walletAddress,
            })
          )

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
    contractSide,
    isRangeValid,
    market,
    marketUnavailableMessage,
    rangeStrikes,
    selectedQuantity,
    ticketStrikePriceUsd,
    ticketMode,
    walletAddress,
  ])

  async function handleTrade() {
    if (marketUnavailableMessage) {
      setErrorMessage(marketUnavailableMessage)
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

    if (!selectedQuantity) {
      setErrorMessage("Enter a positive size")
      return
    }

    if (ticketMode === "range" && !isRangeValid) {
      setErrorMessage("Lower strike must be below upper strike")
      return
    }

    if (!quotedQuote) {
      setErrorMessage("Wait for an executable quote")
      return
    }

    const estimatedReserveAmount = getTradeReserveAmount(quotedQuote.mintCost)

    if (availableDusdcBalance < estimatedReserveAmount) {
      setErrorMessage("Available DUSDC is below the estimated trade reserve.")
      return
    }

    setIsSubmitting(true)
    setStatusKind("neutral")
    setErrorMessage(undefined)

    try {
      const params = getTradeParams({
        contractSide,
        market,
        quantity: selectedQuantity,
        rangeStrikes,
        selectedStrikePriceUsd: ticketStrikePriceUsd,
        ticketMode,
        walletAddress,
      })
      const hadManager = Boolean(predictAccount.managerId)

      if (!hadManager) {
        setStatusMessage("Creating trading account")
      }

      const managerId = await predictAccount.ensureManager(signer)

      setStatusMessage("Preparing funding and buy")

      const preparedMint = await preparePredictMintTransaction({
        managerBalance: managerDusdcBalance,
        managerId,
        params,
        quotedCost: quotedQuote.mintCost,
      })

      setStatusMessage(
        preparedMint.depositAmount > 0n
          ? `Depositing ${formatDusdc(preparedMint.depositAmount)} and buying`
          : "Using trading balance and buying"
      )
      await executeSuiTransaction(signer, preparedMint.transaction)

      setStatusMessage("Trade confirmed")
      setStatusKind("success")
      if (ticketMode === "binary") {
        pinStrikeSearchParam(ticketStrikePriceUsd)
      }
      void predictAccount.refreshAccount()
      refreshRoute()
      window.setTimeout(refreshRoute, 1_500)
    } catch (error) {
      setStatusMessage(undefined)
      setStatusKind("neutral")
      setErrorMessage(formatPredictTradeError(error, "Trade failed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <Tabs
        className="gap-0"
        onValueChange={(value) => {
          if (isTicketMode(value)) {
            setTicketMode(value)
          }
        }}
        value={ticketMode}
      >
        <TabsList className="w-full overflow-hidden rounded-md bg-muted/25 p-0">
          {(["binary", "range"] satisfies TicketMode[]).map((mode) => (
            <TicketModeTab key={mode} mode={mode} />
          ))}
        </TabsList>
      </Tabs>

      <TicketCard>
        {ticketMode === "binary" ? (
          <>
            <div aria-label="Direction" className="grid grid-cols-2 gap-2">
              {(["above", "below"] satisfies ContractSide[]).map((side) => {
                const isSelected = contractSide === side
                const SideIcon = getSideIcon(side)

                return (
                  <Button
                    aria-pressed={isSelected}
                    className={cn(
                      "border border-border/35 bg-muted/25 text-sm font-medium text-muted-foreground shadow-none ring-0 transition-[background-color,border-color,color,transform] duration-150 hover:border-border/50 hover:bg-muted/35 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96]",
                      isSelected &&
                        (side === "above"
                          ? "border-outcome-up/30 bg-outcome-up/10 text-outcome-up hover:bg-outcome-up/15"
                          : "border-outcome-down/30 bg-outcome-down/10 text-outcome-down hover:bg-outcome-down/15")
                    )}
                    key={side}
                    onClick={() => setContractSide(side)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <SideIcon className="size-3" />
                    {getSideLabel(side)}
                  </Button>
                )
              })}
            </div>

            <StrikeInput
              customStrike={customStrike}
              onCommitStrike={() => {
                const parsedStrike = parseStrikeInput(customStrike)

                if (parsedStrike) {
                  applyStrike(parsedStrike)
                }
              }}
              onCustomStrikeChange={setCustomStrike}
              selectedStrikePriceUsd={ticketStrikePriceUsd}
            />
          </>
        ) : (
          <RangeSelector
            higherStrike={rangeStrikes.higher}
            lowerStrike={rangeStrikes.lower}
            market={market}
            onHigherStrikeChange={(value) => {
              setRangeStrikes((currentStrikes) => ({
                ...currentStrikes,
                higher: value,
              }))
            }}
            onLowerStrikeChange={(value) => {
              setRangeStrikes((currentStrikes) => ({
                ...currentStrikes,
                lower: value,
              }))
            }}
          />
        )}

        <label className="block space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            Contracts
          </span>
          <div className="relative">
            <Input
              className="border-border/35 bg-muted/25 pr-24 font-mono text-xs shadow-none ring-0 transition-[background-color,border-color,color] duration-150 hover:bg-muted/30 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
              inputMode="decimal"
              onChange={(event) => setSize(event.target.value)}
              placeholder="0.00"
              value={size}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
              Contracts
            </span>
          </div>
        </label>

        <TicketSection>
          {ticketMode === "binary" ? (
            <>
              <TicketRow label="Price" value={quotePriceValue} />
              <TicketRow label="Chance" value={chance} />
              <TicketRow label="Premium" value={premiumValue} />
              <TicketRow label="Max loss" value={maxLossValue} />
              <TicketRow
                label="Potential profit"
                value={potentialProfitValue}
              />
            </>
          ) : (
            <>
              <TicketRow
                label="Range"
                value={`${formatStrikeValue(
                  rangeStrikes.lower,
                  market.tickSizeUsd
                )}-${formatStrikeValue(rangeStrikes.higher, market.tickSizeUsd)}`}
              />
              <TicketRow label="Price" value={quotePriceValue} />
              <TicketRow label="Premium" value={premiumValue} />
              <TicketRow label="Max loss" value={maxLossValue} />
              <TicketRow
                label="Potential profit"
                value={potentialProfitValue}
              />
            </>
          )}
        </TicketSection>

        {(panelErrorMessage || statusMessage) && (
          <TicketMessage
            kind={
              panelErrorMessage
                ? "error"
                : statusKind === "success"
                  ? "success"
                  : "neutral"
            }
          >
            {panelErrorMessage ?? statusMessage}
          </TicketMessage>
        )}

        {matchingShieldPosition ? (
          <TicketMessage kind="neutral">
            This key is reserved by an active Tail Hedge PLP policy. Manual
            same-key trades can change the manager position and make claim
            abort.
          </TicketMessage>
        ) : null}

        <Button
          className="w-full active:scale-[0.96]"
          disabled={
            !!marketUnavailableMessage || (isTradeDisabled && !!walletAddress)
          }
          onClick={handleTrade}
          type="button"
        >
          {actionButtonLabel}
        </Button>
      </TicketCard>
    </div>
  )
}
