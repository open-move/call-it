import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  MoveHorizontalIcon,
} from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useNavigate, useRevalidator } from "react-router"

import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { formatUsd } from "~/lib/callit/format"
import {
  formatDecimalUnits,
  formatUnitPrice,
  parseDecimalUnits,
} from "~/lib/callit/trading/amounts"
import { type MarketSnapshot } from "~/lib/callit/market/types"
import { type PositionTradeIntent } from "~/lib/callit/trade/types"
import { PREDICT_QUOTE_DECIMALS } from "~/lib/deepbook/config"
import {
  buildCreateManagerTransaction,
  executeSuiTransaction,
  findCreatedManagerId,
  preparePredictMintTransaction,
  type PredictTradeParams,
} from "~/lib/deepbook/predict-transactions"
import {
  formatPredictTradeError,
  formatPredictQuoteMessage,
  quotePredictTradeSafe,
  type PredictQuoteResult,
} from "~/lib/deepbook/predict-quotes"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "~/lib/dynamic/sui-wallet"
import { getPredictManagers } from "~/lib/deepbook/predict-client"
import { cn } from "~/lib/utils"

type TicketMode = "binary" | "range"
type ContractSide = "above" | "below"

export interface OrderTicketProps {
  market: MarketSnapshot
  selectedStrikePriceUsd: number
  tradeIntent?: PositionTradeIntent
}

interface ManagerState {
  managerId?: string
}

interface RangeStrikeState {
  higher: number
  lower: number
}

function getModeLabel(mode: TicketMode) {
  return mode === "binary" ? "Up/Down" : "Range"
}

function getModeIcon(mode: TicketMode) {
  return mode === "binary" ? ArrowUpDownIcon : MoveHorizontalIcon
}

function isTicketMode(value: unknown): value is TicketMode {
  return value === "binary" || value === "range"
}

function getSideLabel(side: ContractSide) {
  return side === "above" ? "Up" : "Down"
}

function getSideIcon(side: ContractSide) {
  return side === "above" ? ArrowUpIcon : ArrowDownIcon
}

function formatStrikeValue(value: number, tickSizeUsd: number) {
  return formatUsd(value, tickSizeUsd < 1 ? 2 : 0)
}

function formatStrikeInput(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function parseStrikeInput(value: string) {
  const normalizedValue = value.replaceAll(",", "").replace("$", "").trim()

  if (!normalizedValue) {
    return undefined
  }

  const parsedValue = Number(normalizedValue)

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : undefined
}

function normalizeStrikePrice(value: number, market: MarketSnapshot) {
  const tickSizeUsd = market.tickSizeUsd > 0 ? market.tickSizeUsd : 1
  const minStrikeUsd = Math.max(market.minStrikeUsd, tickSizeUsd)
  const roundedValue = Math.round(value / tickSizeUsd) * tickSizeUsd
  const normalizedValue = Math.max(roundedValue, minStrikeUsd)

  return Number(normalizedValue.toFixed(8))
}

function getRangeStrikeDefaults(
  market: MarketSnapshot,
  selectedStrikePriceUsd: number
) {
  const tickSizeUsd = market.tickSizeUsd > 0 ? market.tickSizeUsd : 1
  const rangeWidthUsd = tickSizeUsd * 5

  return {
    higher: normalizeStrikePrice(
      selectedStrikePriceUsd + rangeWidthUsd,
      market
    ),
    lower: normalizeStrikePrice(selectedStrikePriceUsd - rangeWidthUsd, market),
  }
}

function formatStrikeSearchParam(strikePriceUsd: number) {
  return strikePriceUsd.toString()
}

function pinStrikeSearchParam(strikePriceUsd: number) {
  const url = new URL(window.location.href)
  const strikeParam = formatStrikeSearchParam(strikePriceUsd)

  if (url.searchParams.get("strike") === strikeParam) {
    return
  }

  url.searchParams.set("strike", strikeParam)
  window.history.replaceState(window.history.state, "", url)
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function loadManagerState(walletAddress: string): Promise<ManagerState> {
  const [manager] = await getPredictManagers(walletAddress)

  if (!manager) {
    return {}
  }

  return {
    managerId: manager.manager_id,
  }
}

async function waitForManagerState(walletAddress: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const managerState = await loadManagerState(walletAddress)

    if (managerState.managerId) {
      return managerState
    }

    await sleep(1_000)
  }

  throw new Error(
    "Manager creation confirmed, but the indexer has not caught up"
  )
}

function formatDusdc(value: bigint) {
  return `${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)} DUSDC`
}

function getMarketUnavailableMessage(market: MarketSnapshot, nowMs: number) {
  if (nowMs >= market.expiryMs) {
    return "This market has expired and is waiting for settlement. Choose a later expiry."
  }

  if (market.status !== "active") {
    return "This market is not active. Choose an active expiry."
  }

  return undefined
}

function getTradeParams({
  contractSide,
  market,
  quantity,
  rangeStrikes,
  selectedStrikePriceUsd,
  ticketMode,
  walletAddress,
}: {
  contractSide: ContractSide
  market: MarketSnapshot
  quantity: bigint
  rangeStrikes: RangeStrikeState
  selectedStrikePriceUsd: number
  ticketMode: TicketMode
  walletAddress: string
}): PredictTradeParams {
  if (ticketMode === "range") {
    return {
      expiryMs: market.expiryMs,
      higherStrikePriceUsd: rangeStrikes.higher,
      kind: "range",
      lowerStrikePriceUsd: rangeStrikes.lower,
      oracleId: market.oracleId,
      quantity,
      walletAddress,
    }
  }

  return {
    expiryMs: market.expiryMs,
    isUp: contractSide === "above",
    oracleId: market.oracleId,
    quantity,
    strikePriceUsd: selectedStrikePriceUsd,
    walletAddress,
  }
}

export function OrderTicket(props: OrderTicketProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <OrderTicketFallback {...props} />
  }

  return <OrderTicketClient {...props} />
}

function OrderTicketFallback({}: OrderTicketProps) {
  return (
    <Card className="h-full w-full rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="flex flex-1 flex-col gap-3 px-3 py-3">
        <Button className="h-9 w-full" disabled type="button">
          Sign in to trade
        </Button>
      </CardContent>
    </Card>
  )
}

function OrderTicketClient({
  market,
  selectedStrikePriceUsd,
  tradeIntent,
}: OrderTicketProps) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const [ticketMode, setTicketMode] = useState<TicketMode>("binary")
  const [contractSide, setContractSide] = useState<ContractSide>("above")
  const [ticketStrikePriceUsd, setTicketStrikePriceUsd] = useState(
    selectedStrikePriceUsd
  )
  const [size, setSize] = useState("")
  const [customStrike, setCustomStrike] = useState(() =>
    formatStrikeInput(selectedStrikePriceUsd)
  )
  const [rangeStrikes, setRangeStrikes] = useState(() =>
    getRangeStrikeDefaults(market, selectedStrikePriceUsd)
  )
  const [managerState, setManagerState] = useState<ManagerState>({})
  const [isLoadingManager, setIsLoadingManager] = useState(false)
  const [quote, setQuote] = useState<PredictQuoteResult>()
  const [isQuoting, setIsQuoting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>()
  const [statusKind, setStatusKind] = useState<"neutral" | "success">("neutral")
  const [errorMessage, setErrorMessage] = useState<string>()
  const [nowMs, setNowMs] = useState(() => Date.now())
  const walletAddress = primaryWallet?.address
  const selectedQuantity = parseDecimalUnits(size, PREDICT_QUOTE_DECIMALS)
  const isAbove = contractSide === "above"
  const isRangeValid = rangeStrikes.lower < rangeStrikes.higher
  const quotedQuote = quote?.status === "quoted" ? quote : undefined
  const marketUnavailableMessage = getMarketUnavailableMessage(market, nowMs)
  const panelErrorMessage = marketUnavailableMessage ?? errorMessage
  const chance =
    market.fairUpProbability === undefined
      ? "--"
      : `${Math.round((isAbove ? market.fairUpProbability : 1 - market.fairUpProbability) * 100)}%`
  const isTradeDisabled =
    isSubmitting ||
    isLoadingManager ||
    isQuoting ||
    !!marketUnavailableMessage ||
    !selectedQuantity ||
    !quotedQuote ||
    (ticketMode === "range" && !isRangeValid)
  const actionButtonLabel = marketUnavailableMessage
    ? "Market closed"
    : !walletAddress
      ? "Sign in to trade"
      : isSubmitting
        ? "Submitting"
        : ticketMode === "range"
          ? "Buy Range"
          : `Buy ${getSideLabel(contractSide)}`

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1_000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    setTicketStrikePriceUsd(selectedStrikePriceUsd)
    setCustomStrike(formatStrikeInput(selectedStrikePriceUsd))
    setRangeStrikes(getRangeStrikeDefaults(market, selectedStrikePriceUsd))
  }, [market, selectedStrikePriceUsd])

  function applyStrike(nextStrikePriceUsd: number) {
    const normalizedStrikePriceUsd = normalizeStrikePrice(
      nextStrikePriceUsd,
      market
    )
    const strikeParam = formatStrikeSearchParam(normalizedStrikePriceUsd)
    const searchParams = new URLSearchParams(window.location.search)

    setTicketStrikePriceUsd(normalizedStrikePriceUsd)
    setCustomStrike(formatStrikeInput(normalizedStrikePriceUsd))
    setQuote(undefined)

    if (searchParams.get("strike") === strikeParam) {
      return
    }

    searchParams.set("strike", strikeParam)
    navigate({ search: `?${searchParams.toString()}` })
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

    async function load() {
      if (!walletAddress) {
        setManagerState({})
        return
      }

      setIsLoadingManager(true)
      setErrorMessage(undefined)

      try {
        const nextManagerState = await loadManagerState(walletAddress)

        if (!isStale) {
          setManagerState(nextManagerState)
        }
      } catch (error) {
        if (!isStale) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load account"
          )
        }
      } finally {
        if (!isStale) {
          setIsLoadingManager(false)
        }
      }
    }

    void load()

    return () => {
      isStale = true
    }
  }, [walletAddress])

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
      let managerId = managerState.managerId

      if (!managerId) {
        setStatusMessage("Creating trading account")
        const createResult = await executeSuiTransaction(
          signer,
          buildCreateManagerTransaction(walletAddress)
        )
        managerId = findCreatedManagerId(createResult.events)

        if (!managerId) {
          const nextManagerState = await waitForManagerState(walletAddress)
          managerId = nextManagerState.managerId
          setManagerState(nextManagerState)
        }
      }

      if (!managerId) {
        throw new Error("Could not resolve trading account")
      }

      setStatusMessage("Preparing funding and buy")

      const preparedMint = await preparePredictMintTransaction({
        managerId,
        params,
        quotedCost: quotedQuote.mintCost,
      })

      setStatusMessage(
        `Funding ${formatDusdc(preparedMint.reserveAmount)} and buying`
      )
      await executeSuiTransaction(signer, preparedMint.transaction)

      setStatusMessage("Trade confirmed")
      setStatusKind("success")
      if (ticketMode === "binary") {
        pinStrikeSearchParam(ticketStrikePriceUsd)
      }
      const nextManagerState = await loadManagerState(walletAddress)
      setManagerState(nextManagerState)
      revalidator.revalidate()
      window.setTimeout(() => revalidator.revalidate(), 1_500)
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
        <TabsList className="h-9 w-full overflow-hidden rounded-md bg-muted p-0">
          {(["binary", "range"] satisfies TicketMode[]).map((mode) => (
            <TicketModeTab key={mode} mode={mode} />
          ))}
        </TabsList>
      </Tabs>

      <Card className="w-full flex-1 rounded-md border-0 bg-card py-0 shadow-none ring-0">
        <CardContent className="flex flex-1 flex-col gap-3 px-3 py-3">
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
                        "h-8 border-0 bg-muted text-sm font-normal text-muted-foreground shadow-none ring-0 hover:bg-accent focus-visible:ring-0",
                        isSelected &&
                          (side === "above"
                            ? "bg-outcome-up/10 text-outcome-up hover:bg-outcome-up/15"
                            : "bg-outcome-down/10 text-outcome-down hover:bg-outcome-down/15")
                      )}
                      key={side}
                      onClick={() => setContractSide(side)}
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
            <span className="text-xs text-muted-foreground">Contracts</span>
            <div className="relative">
              <Input
                className="h-9 border-0 pr-24 font-mono text-xs shadow-none ring-0 focus-visible:ring-1"
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

          <TicketSection title="Order">
            {ticketMode === "binary" ? (
              <>
                <TicketRow
                  label="Price"
                  value={
                    quotedQuote && selectedQuantity
                      ? `${formatUnitPrice(
                          quotedQuote.mintCost,
                          selectedQuantity
                        )} DUSDC`
                      : quote?.status === "no_quote"
                        ? "No quote"
                        : isQuoting
                          ? "Quoting"
                          : "--"
                  }
                />
                <TicketRow label="Chance" value={chance} />
                <TicketRow
                  label="Cost"
                  value={quotedQuote ? formatDusdc(quotedQuote.mintCost) : "--"}
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
                <TicketRow
                  label="Price"
                  value={
                    !isRangeValid
                      ? "Invalid range"
                      : quotedQuote && selectedQuantity
                        ? `${formatUnitPrice(
                            quotedQuote.mintCost,
                            selectedQuantity
                          )} DUSDC`
                        : quote?.status === "no_quote"
                          ? "No quote"
                          : isQuoting
                            ? "Quoting"
                            : "--"
                  }
                />
                <TicketRow
                  label="Cost"
                  value={quotedQuote ? formatDusdc(quotedQuote.mintCost) : "--"}
                />
              </>
            )}
          </TicketSection>

          {(panelErrorMessage || statusMessage) && (
            <p
              className={cn(
                "rounded-md px-3 py-2 text-xs leading-5",
                panelErrorMessage
                  ? "bg-destructive/10 text-destructive"
                  : statusKind === "success"
                    ? "bg-outcome-up/10 text-outcome-up"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {panelErrorMessage ?? statusMessage}
            </p>
          )}

          <Button
            className="h-9 w-full"
            disabled={
              !!marketUnavailableMessage || (isTradeDisabled && !!walletAddress)
            }
            onClick={handleTrade}
            type="button"
          >
            {actionButtonLabel}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function TicketModeTab({ mode }: { mode: TicketMode }) {
  const ModeIcon = getModeIcon(mode)

  return (
    <TabsTrigger
      className="!h-full rounded-none border-0 !border-transparent text-sm font-normal text-muted-foreground shadow-none ring-0 outline-none after:hidden focus-visible:!border-transparent focus-visible:!ring-0 focus-visible:!outline-none data-active:!border-transparent data-active:!bg-primary/10 data-active:!text-primary dark:data-active:!border-transparent"
      value={mode}
    >
      <ModeIcon className="size-3.5" />
      {getModeLabel(mode)}
    </TabsTrigger>
  )
}

function StrikeInput({
  customStrike,
  onCommitStrike,
  onCustomStrikeChange,
  selectedStrikePriceUsd,
}: {
  customStrike: string
  onCommitStrike: () => void
  onCustomStrikeChange: (value: string) => void
  selectedStrikePriceUsd: number
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs text-muted-foreground">Strike (USD)</span>
      <Input
        className="h-9 border-0 font-mono text-xs shadow-none ring-0 focus-visible:ring-1"
        inputMode="decimal"
        onBlur={onCommitStrike}
        onChange={(event) => onCustomStrikeChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
        }}
        placeholder={formatStrikeInput(selectedStrikePriceUsd)}
        value={customStrike}
      />
    </label>
  )
}

function RangeSelector({
  higherStrike,
  lowerStrike,
  market,
  onHigherStrikeChange,
  onLowerStrikeChange,
}: {
  higherStrike: number
  lowerStrike: number
  market: MarketSnapshot
  onHigherStrikeChange: (strikePriceUsd: number) => void
  onLowerStrikeChange: (strikePriceUsd: number) => void
}) {
  const [lowerInput, setLowerInput] = useState(() =>
    formatStrikeInput(lowerStrike)
  )
  const [higherInput, setHigherInput] = useState(() =>
    formatStrikeInput(higherStrike)
  )

  useEffect(() => {
    setLowerInput(formatStrikeInput(lowerStrike))
    setHigherInput(formatStrikeInput(higherStrike))
  }, [higherStrike, lowerStrike])

  function commitLowerStrike() {
    const parsedStrike = parseStrikeInput(lowerInput)

    if (!parsedStrike) {
      setLowerInput(formatStrikeInput(lowerStrike))
      return
    }

    onLowerStrikeChange(normalizeStrikePrice(parsedStrike, market))
  }

  function commitHigherStrike() {
    const parsedStrike = parseStrikeInput(higherInput)

    if (!parsedStrike) {
      setHigherInput(formatStrikeInput(higherStrike))
      return
    }

    onHigherStrikeChange(normalizeStrikePrice(parsedStrike, market))
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-2">
        <span className="text-xs text-muted-foreground">
          Lower Strike (USD)
        </span>
        <Input
          className="h-9 border-0 font-mono text-xs shadow-none ring-0 focus-visible:ring-1"
          inputMode="decimal"
          onBlur={commitLowerStrike}
          onChange={(event) => setLowerInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            }
          }}
          value={lowerInput}
        />
      </label>
      <label className="space-y-2">
        <span className="text-xs text-muted-foreground">
          Upper Strike (USD)
        </span>
        <Input
          className="h-9 border-0 font-mono text-xs shadow-none ring-0 focus-visible:ring-1"
          inputMode="decimal"
          onBlur={commitHigherStrike}
          onChange={(event) => setHigherInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            }
          }}
          value={higherInput}
        />
      </label>
    </div>
  )
}

function TicketSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <div className="space-y-2 rounded-md bg-muted p-2.5 text-sm">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-right font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}
