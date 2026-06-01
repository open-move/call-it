import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState, type ReactNode } from "react"
import { useRevalidator } from "react-router"

import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  formatDecimalUnits,
  formatUnitPrice,
  parseDecimalUnits,
} from "~/lib/callit/trading/amounts"
import { type MarketSnapshot } from "~/lib/callit/market/types"
import {
  PREDICT_PRICE_SCALE,
  PREDICT_QUOTE_DECIMALS,
} from "~/lib/deepbook/config"
import {
  buildCreateManagerTransaction,
  buildDirectionalRedeemTransaction,
  executeSuiTransaction,
  findCreatedManagerId,
  prepareDirectionalMintTransaction,
  type DirectionalTradeParams,
  type SuiTransactionSigner,
} from "~/lib/deepbook/predict-transactions"
import {
  formatPredictTradeError,
  formatPredictQuoteMessage,
  quoteDirectionalTradeSafe,
  type PredictQuoteResult,
} from "~/lib/deepbook/predict-quotes"
import {
  getManagerPositionSummaries,
  getPredictManagers,
} from "~/lib/deepbook/predict-client"
import { type ManagerPositionSummary } from "~/lib/deepbook/predict-types"
import { cn } from "~/lib/utils"

type TradeAction = "buy" | "sell"
type ContractSide = "above" | "below"

export interface OrderTicketProps {
  market: MarketSnapshot
  selectedStrikePriceUsd: number
}

interface ManagerState {
  managerId?: string
  openQuantity: bigint
}

function getActionLabel(action: TradeAction) {
  return action === "buy" ? "Buy" : "Sell"
}

function isTradeAction(value: unknown): value is TradeAction {
  return value === "buy" || value === "sell"
}

function getSideLabel(side: ContractSide) {
  return side === "above" ? "Above" : "Below"
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

function isSuiTransactionSigner(value: unknown): value is SuiTransactionSigner {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const candidate = value as { signTransaction?: unknown }

  return typeof candidate.signTransaction === "function"
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function toOnchainStrike(valueUsd: number) {
  return Math.round(valueUsd * PREDICT_PRICE_SCALE)
}

function getOpenQuantity(
  summaries: ManagerPositionSummary[],
  params: {
    expiryMs: number
    isUp: boolean
    oracleId: string
    strikePriceUsd: number
  }
) {
  const strike = toOnchainStrike(params.strikePriceUsd)

  return summaries.reduce((total, summary) => {
    const isMatchingPosition =
      summary.oracle_id === params.oracleId &&
      summary.expiry === params.expiryMs &&
      summary.strike === strike &&
      summary.is_up === params.isUp

    return isMatchingPosition ? total + BigInt(summary.open_quantity) : total
  }, 0n)
}

async function loadManagerState(
  walletAddress: string,
  params: {
    expiryMs: number
    isUp: boolean
    oracleId: string
    strikePriceUsd: number
  }
): Promise<ManagerState> {
  const [manager] = await getPredictManagers(walletAddress)

  if (!manager) {
    return { openQuantity: 0n }
  }

  const summaries = await getManagerPositionSummaries(manager.manager_id)

  return {
    managerId: manager.manager_id,
    openQuantity: getOpenQuantity(summaries, params),
  }
}

async function waitForManagerState(
  walletAddress: string,
  params: {
    expiryMs: number
    isUp: boolean
    oracleId: string
    strikePriceUsd: number
  }
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const managerState = await loadManagerState(walletAddress, params)

    if (managerState.managerId) {
      return managerState
    }

    await sleep(1_000)
  }

  throw new Error(
    "Manager creation confirmed, but the indexer has not caught up"
  )
}

function formatContracts(value: bigint) {
  return `${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)} Contracts`
}

function formatDusdc(value: bigint) {
  return `${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)} DUSDC`
}

function getTradeParams({
  contractSide,
  market,
  quantity,
  selectedStrikePriceUsd,
  walletAddress,
}: {
  contractSide: ContractSide
  market: MarketSnapshot
  quantity: bigint
  selectedStrikePriceUsd: number
  walletAddress: string
}): DirectionalTradeParams {
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
      <CardContent className="flex flex-1 flex-col gap-4 px-4 py-4">
        <Button className="h-11 w-full" disabled type="button">
          Sign in to trade
        </Button>
      </CardContent>
    </Card>
  )
}

function OrderTicketClient({
  market,
  selectedStrikePriceUsd,
}: OrderTicketProps) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const revalidator = useRevalidator()
  const [tradeAction, setTradeAction] = useState<TradeAction>("buy")
  const [contractSide, setContractSide] = useState<ContractSide>("above")
  const [size, setSize] = useState("")
  const [managerState, setManagerState] = useState<ManagerState>({
    openQuantity: 0n,
  })
  const [isLoadingManager, setIsLoadingManager] = useState(false)
  const [quote, setQuote] = useState<PredictQuoteResult>()
  const [isQuoting, setIsQuoting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const walletAddress = primaryWallet?.address
  const selectedQuantity = parseDecimalUnits(size, PREDICT_QUOTE_DECIMALS)
  const isAbove = contractSide === "above"
  const quotedQuote = quote?.status === "quoted" ? quote : undefined
  const chance =
    market.fairUpProbability === undefined
      ? "--"
      : `${Math.round((isAbove ? market.fairUpProbability : 1 - market.fairUpProbability) * 100)}%`
  const canSell =
    tradeAction === "sell" &&
    !!selectedQuantity &&
    selectedQuantity <= managerState.openQuantity
  const isTradeDisabled =
    isSubmitting ||
    isLoadingManager ||
    isQuoting ||
    !selectedQuantity ||
    !quotedQuote ||
    (tradeAction === "sell" && !canSell)
  const actionButtonLabel = !walletAddress
    ? "Sign in to trade"
    : isSubmitting
      ? "Submitting"
      : tradeAction === "buy"
        ? `Buy ${getSideLabel(contractSide)}`
        : `Sell ${getSideLabel(contractSide)}`

  useEffect(() => {
    let isStale = false

    async function load() {
      if (!walletAddress) {
        setManagerState({ openQuantity: 0n })
        return
      }

      setIsLoadingManager(true)
      setErrorMessage(undefined)

      try {
        const nextManagerState = await loadManagerState(walletAddress, {
          expiryMs: market.expiryMs,
          isUp: isAbove,
          oracleId: market.oracleId,
          strikePriceUsd: selectedStrikePriceUsd,
        })

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
  }, [
    isAbove,
    market.expiryMs,
    market.oracleId,
    selectedStrikePriceUsd,
    walletAddress,
  ])

  useEffect(() => {
    let isStale = false
    const timeoutId = window.setTimeout(() => {
      async function loadQuote() {
        if (!walletAddress || !selectedQuantity) {
          setQuote(undefined)
          return
        }

        setIsQuoting(true)

        try {
          const nextQuote = await quoteDirectionalTradeSafe(
            getTradeParams({
              contractSide,
              market,
              quantity: selectedQuantity,
              selectedStrikePriceUsd,
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
    market,
    selectedQuantity,
    selectedStrikePriceUsd,
    walletAddress,
  ])

  async function handleTrade() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    if (!isSuiTransactionSigner(primaryWallet)) {
      setErrorMessage("Connected wallet cannot sign Sui transactions")
      return
    }

    if (!selectedQuantity) {
      setErrorMessage("Enter a positive size")
      return
    }

    if (!quotedQuote) {
      setErrorMessage("Wait for an executable quote")
      return
    }

    if (
      tradeAction === "sell" &&
      selectedQuantity > managerState.openQuantity
    ) {
      setErrorMessage("Sell size exceeds open position")
      return
    }

    setIsSubmitting(true)
    setErrorMessage(undefined)

    try {
      const params = getTradeParams({
        contractSide,
        market,
        quantity: selectedQuantity,
        selectedStrikePriceUsd,
        walletAddress,
      })
      let managerId = managerState.managerId

      if (!managerId) {
        setStatusMessage("Creating trading account")
        const createResult = await executeSuiTransaction(
          primaryWallet,
          buildCreateManagerTransaction(walletAddress)
        )
        managerId = findCreatedManagerId(createResult.events)

        if (!managerId) {
          const nextManagerState = await waitForManagerState(
            walletAddress,
            params
          )
          managerId = nextManagerState.managerId
          setManagerState(nextManagerState)
        }
      }

      if (!managerId) {
        throw new Error("Could not resolve trading account")
      }

      if (tradeAction === "buy") {
        setStatusMessage("Preparing funding and buy")

        const preparedMint = await prepareDirectionalMintTransaction({
          managerId,
          params,
          quotedCost: quotedQuote.mintCost,
        })

        setStatusMessage(
          `Funding ${formatDusdc(preparedMint.reserveAmount)} and buying`
        )
        await executeSuiTransaction(primaryWallet, preparedMint.transaction)
      } else {
        setStatusMessage("Selling position")
        await executeSuiTransaction(
          primaryWallet,
          buildDirectionalRedeemTransaction({ managerId, params })
        )
      }

      setStatusMessage("Trade confirmed")
      pinStrikeSearchParam(selectedStrikePriceUsd)
      const nextManagerState = await loadManagerState(walletAddress, params)
      setManagerState(nextManagerState)
      revalidator.revalidate()
      window.setTimeout(() => revalidator.revalidate(), 1_500)
    } catch (error) {
      setStatusMessage(undefined)
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
          if (isTradeAction(value)) {
            setTradeAction(value)
          }
        }}
        value={tradeAction}
      >
        <TabsList className="h-9 w-full overflow-hidden rounded-md bg-muted p-0">
          {(["buy", "sell"] satisfies TradeAction[]).map((action) => (
            <TabsTrigger
              className={cn(
                "!h-full rounded-none border-0 !border-transparent text-sm font-semibold shadow-none ring-0 outline-none after:hidden focus-visible:!border-transparent focus-visible:!ring-0 focus-visible:!outline-none data-active:!border-transparent dark:data-active:!border-transparent",
                action === "buy"
                  ? "data-active:!bg-outcome-up/10 data-active:!text-outcome-up"
                  : "data-active:!bg-outcome-down/10 data-active:!text-outcome-down"
              )}
              key={action}
              value={action}
            >
              {getActionLabel(action)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="w-full flex-1 rounded-md border-0 bg-card py-0 shadow-none ring-0">
        <CardContent className="flex flex-1 flex-col gap-4 px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            {(["above", "below"] satisfies ContractSide[]).map((side) => {
              const isSelected = contractSide === side

              return (
                <Button
                  aria-pressed={isSelected}
                  className={cn(
                    "h-10 border-0 bg-muted text-sm font-semibold text-foreground shadow-none ring-0 hover:bg-accent focus-visible:ring-0",
                    isSelected &&
                      "bg-primary text-primary-foreground hover:bg-primary"
                  )}
                  key={side}
                  onClick={() => setContractSide(side)}
                  type="button"
                  variant="secondary"
                >
                  {getSideLabel(side)}
                </Button>
              )
            })}
          </div>

          <label className="block space-y-2">
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              Contracts
            </span>
            <div className="relative">
              <Input
                className="h-11 border-0 pr-24 font-mono shadow-none ring-0 focus-visible:ring-1"
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
            <TicketRow
              label="Price"
              value={
                quotedQuote && selectedQuantity
                  ? `${formatUnitPrice(
                      tradeAction === "buy"
                        ? quotedQuote.mintCost
                        : quotedQuote.redeemPayout,
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
            {tradeAction === "buy" ? (
              <TicketRow
                label="Cost"
                value={quotedQuote ? formatDusdc(quotedQuote.mintCost) : "--"}
              />
            ) : (
              <>
                <TicketRow
                  label="Open"
                  value={formatContracts(managerState.openQuantity)}
                />
                <TicketRow
                  label="Receive"
                  value={
                    quotedQuote ? formatDusdc(quotedQuote.redeemPayout) : "--"
                  }
                />
              </>
            )}
          </TicketSection>

          {(errorMessage || statusMessage) && (
            <p
              className={cn(
                "rounded-md px-3 py-2 text-xs leading-5",
                errorMessage
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {errorMessage ?? statusMessage}
            </p>
          )}

          <Button
            className="h-11 w-full"
            disabled={isTradeDisabled && !!walletAddress}
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

function TicketSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate text-right font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}
