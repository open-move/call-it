import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { ShieldCheckIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useRevalidator } from "react-router"

import { BadgeTone } from "~/components/primitives/badge"
import { DetailChartCard } from "~/components/shared/detail/detail-chart-card"
import { DetailTabs } from "~/components/shared/detail/detail-tabs"
import {
  TicketCard,
  TicketMessage,
  TicketRow,
  TicketSection,
} from "~/components/shared/ticket/ticket"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { formatRelativeTime, formatUsd } from "~/lib/callit/format"
import { type ExpiryOption } from "~/lib/callit/market/types"
import {
  getShieldProductHref,
  getShieldTenorLabel,
} from "~/lib/callit/shield/products"
import { type ShieldProduct } from "~/lib/callit/shield/types"
import {
  formatDecimalUnits,
  parseDecimalUnits,
} from "~/lib/callit/trading/amounts"
import {
  getManagerPositionSummaries,
  getPredictManagers,
  getPredictVaultSummary,
} from "~/lib/deepbook/predict-client"
import {
  getShieldPositions,
  type ShieldPositionRow,
} from "~/lib/deepbook/shield-client"
import { PREDICT_QUOTE_DECIMALS } from "~/lib/deepbook/config"
import { formatPredictTradeError } from "~/lib/deepbook/predict-quotes"
import { prepareShieldOpenTransaction } from "~/lib/deepbook/shield-transactions"
import {
  buildCreateManagerTransaction,
  executeSuiTransaction,
  findCreatedManagerId,
} from "~/lib/deepbook/predict-transactions"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "~/lib/dynamic/sui-wallet"
import { type ManagerPositionSummary } from "~/lib/deepbook/predict-types"
import { cn } from "~/lib/utils"

interface ManagerState {
  managerId?: string
}

interface EstimatedShieldPosition extends ShieldPositionRow {
  estimatedPnlPercent?: number
  estimatedPnlUsd?: number
  estimatedValueUsd?: number
  hedgeValueUsd?: number
  plpValueUsd?: number
}

export interface DetailPageProps {
  expiryProducts: ShieldProduct[]
  product: ShieldProduct
}

function formatExpiryDistance(expiryMs: number, nowMs = Date.now()) {
  const remainingMs = expiryMs - nowMs

  if (remainingMs <= 0) {
    return "Expired"
  }

  const minutes = Math.round(remainingMs / 60_000)

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.round(minutes / 60)

  if (hours < 48) {
    return `${hours}h`
  }

  return `${Math.round(hours / 24)}d`
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function formatDusdc(value: bigint) {
  return `${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)} DUSDC`
}

function formatPnlUsd(value: number) {
  const formatted = formatUsd(Math.abs(value))

  if (value > 0) {
    return `+${formatted}`
  }

  if (value < 0) {
    return `-${formatted}`
  }

  return formatted
}

function formatPnlPercent(value: number) {
  const displayValue = Math.abs(value) < 0.00005 ? 0 : value
  const formatted = Math.abs(displayValue * 100).toFixed(2)

  if (displayValue > 0) {
    return `+${formatted}%`
  }

  if (displayValue < 0) {
    return `-${formatted}%`
  }

  return `${formatted}%`
}

function toQuoteAmount(value: number) {
  return value / 10 ** PREDICT_QUOTE_DECIMALS
}

function toQuoteAmountFromBigInt(value: bigint) {
  return Number(value) / 10 ** PREDICT_QUOTE_DECIMALS
}

function getHedgeSummary(
  position: ShieldPositionRow,
  summaries: ManagerPositionSummary[]
) {
  return summaries.find(
    (summary) =>
      summary.manager_id === position.managerId &&
      summary.oracle_id === position.oracleId &&
      summary.expiry === position.hedgeExpiryMs &&
      BigInt(summary.strike) === position.hedgeStrike &&
      !summary.is_up &&
      summary.open_quantity > 0
  )
}

async function enrichShieldPositions(
  positions: ShieldPositionRow[]
): Promise<EstimatedShieldPosition[]> {
  if (positions.length === 0) {
    return []
  }

  const managerIds = Array.from(
    new Set(positions.map((position) => position.managerId))
  )
  const [vaultResult, summariesResult] = await Promise.allSettled([
    getPredictVaultSummary(),
    Promise.all(
      managerIds.map((managerId) => getManagerPositionSummaries(managerId))
    ),
  ])
  const vaultSummary =
    vaultResult.status === "fulfilled" ? vaultResult.value : undefined
  const summaries =
    summariesResult.status === "fulfilled" ? summariesResult.value.flat() : []

  return positions.map((position) => {
    if (!vaultSummary || position.settled) {
      return position
    }

    const hedgeSummary = getHedgeSummary(position, summaries)

    if (!hedgeSummary || hedgeSummary.mark_value === null) {
      return position
    }

    const depositUsd = toQuoteAmountFromBigInt(position.depositAmount)
    const plpValueUsd =
      toQuoteAmountFromBigInt(position.plpAmount) * vaultSummary.plp_share_price
    const hedgeValueUsd = toQuoteAmount(hedgeSummary.mark_value)
    const estimatedValueUsd = plpValueUsd + hedgeValueUsd
    const estimatedPnlUsd = estimatedValueUsd - depositUsd

    return {
      ...position,
      estimatedPnlPercent:
        depositUsd > 0 ? estimatedPnlUsd / depositUsd : undefined,
      estimatedPnlUsd,
      estimatedValueUsd,
      hedgeValueUsd,
      plpValueUsd,
    }
  })
}

async function loadManagerState(walletAddress: string): Promise<ManagerState> {
  const [manager] = await getPredictManagers(walletAddress)

  if (!manager) {
    return {}
  }

  return { managerId: manager.manager_id }
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

export function DetailPage({ expiryProducts, product }: DetailPageProps) {
  const expiryOptions = getShieldExpiryOptions(expiryProducts)
  const [positionRefreshKey, setPositionRefreshKey] = useState(0)

  return (
    <main className="mx-auto w-full max-w-384 px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="grid min-w-0 gap-3">
          <div className="h-120 min-w-0">
            <DetailChartCard
              assetIconUrl={product.market.assetIconUrl}
              assetName={product.market.assetName}
              assetSymbol={product.market.assetSymbol}
              badgeLabel={product.status === "active" ? "Live" : product.status}
              badgeTone={
                product.status === "active" ? BadgeTone.Live : BadgeTone.Neutral
              }
              expiryOptions={expiryOptions}
              getExpiryHref={(option) =>
                getShieldProductHref(
                  expiryProducts.find(
                    (expiryProduct) =>
                      expiryProduct.market.oracleId === option.oracleId
                  ) ?? product
                )
              }
              metrics={[
                { label: "Deposit", value: "DUSDC" },
                { label: "Yield", value: "Predict PLP" },
                { label: "Tenor", value: getShieldTenorLabel(product.tenor) },
                {
                  className: "text-outcome-down",
                  label: "Trigger",
                  value: `Below ${formatUsd(product.protectionStrikeUsd, 0)}`,
                },
                {
                  label: "Budget",
                  value: `≤${product.hedgeBudgetBps / 100}%`,
                },
                {
                  label: "Expires",
                  value: formatExpiryDistance(product.market.expiryMs),
                },
              ]}
              points={product.market.priceHistory}
              referenceLabel="Trigger"
              referencePriceUsd={product.protectionStrikeUsd}
              selectedOracleId={product.market.oracleId}
              title={`${product.market.assetSymbol} Shield · ${getShieldTenorLabel(product.tenor)}`}
            />
          </div>

          <ShieldInfoTabs product={product} refreshKey={positionRefreshKey} />
        </section>

        <aside className="h-full min-w-0">
          <ShieldTicket
            onOpened={() => setPositionRefreshKey((key) => key + 1)}
            product={product}
          />
        </aside>
      </div>
    </main>
  )
}

function getShieldExpiryOptions(products: ShieldProduct[]): ExpiryOption[] {
  return products.map((product) => ({
    assetSymbol: product.market.assetSymbol,
    expiryMs: product.market.expiryMs,
    oracleId: product.market.oracleId,
    status: product.market.status,
  }))
}

function ShieldTicket({
  onOpened,
  product,
}: {
  onOpened?: () => void
  product: ShieldProduct
}) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <ShieldTicketFrame onOpened={onOpened} product={product} />
  }

  return <ShieldTicketClient onOpened={onOpened} product={product} />
}

function ShieldTicketClient({
  onOpened,
  product,
}: {
  onOpened?: () => void
  product: ShieldProduct
}) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const revalidator = useRevalidator()

  return (
    <ShieldTicketFrame
      onOpened={onOpened}
      onConnect={() => setShowAuthFlow(true)}
      product={product}
      revalidate={() => revalidator.revalidate()}
      wallet={primaryWallet}
      walletAddress={primaryWallet?.address}
    />
  )
}

function ShieldTicketFrame({
  onConnect,
  onOpened,
  product,
  revalidate,
  wallet,
  walletAddress,
}: {
  onConnect?: () => void
  onOpened?: () => void
  product: ShieldProduct
  revalidate?: () => void
  wallet?: unknown
  walletAddress?: string
}) {
  const [amount, setAmount] = useState("")
  const [managerState, setManagerState] = useState<ManagerState>({})
  const [isLoadingManager, setIsLoadingManager] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>()
  const [statusKind, setStatusKind] = useState<"neutral" | "success">("neutral")
  const [errorMessage, setErrorMessage] = useState<string>()
  const depositAmount = parseDecimalUnits(amount, PREDICT_QUOTE_DECIMALS)
  const hedgeBudget = depositAmount
    ? (depositAmount * BigInt(product.hedgeBudgetBps)) / 10_000n
    : 0n
  const plpSupply = depositAmount ? depositAmount - hedgeBudget : 0n
  const buttonLabel = !walletAddress
    ? "Sign in"
    : isSubmitting
      ? "Submitting"
      : isLoadingManager
        ? "Loading account"
        : "Open Shield"
  const buttonDisabled = walletAddress
    ? isSubmitting || isLoadingManager || !depositAmount
    : !onConnect

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

  async function handleOpenShield() {
    if (!walletAddress) {
      onConnect?.()
      return
    }

    const signer = await getReadySuiTransactionSigner(wallet)

    if (!signer) {
      setErrorMessage(RECONNECT_SUI_WALLET_MESSAGE)
      onConnect?.()
      return
    }

    if (!depositAmount) {
      setErrorMessage("Enter a positive deposit")
      return
    }

    setIsSubmitting(true)
    setStatusKind("neutral")
    setErrorMessage(undefined)

    try {
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

      setStatusMessage("Preparing Shield")
      const preparedOpen = await prepareShieldOpenTransaction({
        depositAmount,
        expiryMs: product.market.expiryMs,
        hedgeBudgetBps: product.hedgeBudgetBps,
        managerId,
        oracleId: product.market.oracleId,
        protectionStrikeUsd: product.protectionStrikeUsd,
        walletAddress,
      })

      setStatusMessage(
        `Opening ${formatDusdc(depositAmount)} Shield with ${formatDusdc(
          preparedOpen.hedgeBudgetAmount
        )} hedge budget`
      )
      await executeSuiTransaction(signer, preparedOpen.transaction)

      setStatusMessage("Shield opened")
      setStatusKind("success")
      setAmount("")
      onOpened?.()
      revalidate?.()
      window.setTimeout(() => revalidate?.(), 1_500)
    } catch (error) {
      setStatusMessage(undefined)
      setStatusKind("neutral")
      setErrorMessage(formatPredictTradeError(error, "Open Shield failed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <TicketCard>
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheckIcon className="size-3.5 text-primary" />
            Open Shield
          </div>
        </div>

        <label className="block space-y-2">
          <span className="text-xs text-muted-foreground">Deposit</span>
          <div className="relative">
            <Input
              className="border-0 pr-20 font-mono text-xs shadow-none ring-0 focus-visible:ring-1"
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              value={amount}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
              DUSDC
            </span>
          </div>
        </label>

        <TicketSection title="Preview">
          <TicketRow
            label="PLP supply"
            value={depositAmount ? `~${formatDusdc(plpSupply)}` : "--"}
          />
          <TicketRow
            label="Hedge budget"
            value={depositAmount ? `≤${formatDusdc(hedgeBudget)}` : "--"}
          />
        </TicketSection>

        {(errorMessage || statusMessage) && (
          <TicketMessage
            kind={
              errorMessage
                ? "error"
                : statusKind === "success"
                  ? "success"
                  : "neutral"
            }
          >
            {errorMessage ?? statusMessage}
          </TicketMessage>
        )}

        <Button
          className="w-full"
          disabled={buttonDisabled}
          onClick={handleOpenShield}
          type="button"
        >
          {buttonLabel}
        </Button>
      </TicketCard>
    </div>
  )
}

function ShieldInfoTabs({
  product,
  refreshKey,
}: {
  product: ShieldProduct
  refreshKey: number
}) {
  return (
    <DetailTabs
      className="h-[24rem] min-w-0"
      contentClassName="px-3 py-3"
      defaultValue="positions"
      tabs={[
        {
          content: (
            <PositionsContent product={product} refreshKey={refreshKey} />
          ),
          label: "Positions",
          value: "positions",
        },
        {
          content: <TermsContent product={product} />,
          label: "Terms",
          value: "terms",
        },
        { content: <RiskContent />, label: "Risks", value: "risks" },
      ]}
    />
  )
}

function PositionsContent({
  product,
  refreshKey,
}: {
  product: ShieldProduct
  refreshKey: number
}) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <PositionsEmptyState message="Sign in to view Shield positions" />
  }

  return <PositionsContentClient product={product} refreshKey={refreshKey} />
}

function PositionsContentClient({
  product,
  refreshKey,
}: {
  product: ShieldProduct
  refreshKey: number
}) {
  const { primaryWallet } = useDynamicContext()
  const walletAddress = primaryWallet?.address
  const [errorMessage, setErrorMessage] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const [positions, setPositions] = useState<EstimatedShieldPosition[]>([])

  useEffect(() => {
    let isStale = false

    async function loadPositions() {
      if (!walletAddress) {
        setPositions([])
        setErrorMessage(undefined)
        return
      }

      setIsLoading(true)
      setErrorMessage(undefined)

      try {
        const nextPositions = await getShieldPositions(walletAddress)
        const marketPositions = nextPositions.filter(
          (position) => position.oracleId === product.market.oracleId
        )
        const enrichedPositions = await enrichShieldPositions(marketPositions)

        if (!isStale) {
          setPositions(enrichedPositions)
        }
      } catch (error) {
        if (!isStale) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to load Shield positions"
          )
        }
      } finally {
        if (!isStale) {
          setIsLoading(false)
        }
      }
    }

    void loadPositions()

    return () => {
      isStale = true
    }
  }, [product.market.oracleId, refreshKey, walletAddress])

  if (!walletAddress) {
    return <PositionsEmptyState message="Sign in to view Shield positions" />
  }

  if (isLoading) {
    return <PositionsEmptyState message="Loading Shield positions" />
  }

  if (errorMessage) {
    return <PositionsEmptyState message={errorMessage} />
  }

  if (positions.length === 0) {
    return <PositionsEmptyState message="No Shield positions yet" />
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="min-w-[52rem]">
        <ShieldPositionHeaderRow />
        {positions.map((position) => (
          <ShieldPositionRowView key={position.ownerCapId} position={position} />
        ))}
      </div>
    </div>
  )
}

function PositionsEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function ShieldPositionHeaderRow() {
  return (
    <div className="grid grid-cols-[minmax(12rem,1.8fr)_7rem_6rem_6rem_7rem_7rem_5.5rem] gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
      <span>Shield</span>
      <span>Deposit</span>
      <span>PLP</span>
      <span>Hedge</span>
      <span>Est. Value</span>
      <span className="text-right">Est. PnL</span>
      <span className="text-right">Status</span>
    </div>
  )
}

function ShieldPositionRowView({
  position,
}: {
  position: EstimatedShieldPosition
}) {
  const pnlClassName =
    position.estimatedPnlUsd === undefined
      ? "text-muted-foreground"
      : position.estimatedPnlUsd > 0
        ? "text-outcome-up"
        : position.estimatedPnlUsd < 0
          ? "text-outcome-down"
          : "text-muted-foreground"

  return (
    <div className="grid grid-cols-[minmax(12rem,1.8fr)_7rem_6rem_6rem_7rem_7rem_5.5rem] gap-4 border-b border-border/35 px-3 py-2.5 text-xs">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex w-9 shrink-0 font-mono text-[10px] tracking-wide text-primary uppercase">
            SHLD
          </span>
          <span className="truncate font-medium text-foreground">
            Below {formatUsd(position.hedgeStrikeUsd, 0)} Shield
          </span>
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase">
          Opened {formatRelativeTime(position.createdAtMs)} · Expires{" "}
          {formatExpiryDistance(position.hedgeExpiryMs)}
        </div>
      </div>
      <span className="font-mono text-muted-foreground tabular-nums">
        {formatDusdc(position.depositAmount)}
      </span>
      <span className="font-mono tabular-nums">
        {position.plpValueUsd === undefined
          ? "--"
          : formatUsd(position.plpValueUsd)}
      </span>
      <span className="font-mono tabular-nums">
        {position.hedgeValueUsd === undefined
          ? "--"
          : formatUsd(position.hedgeValueUsd)}
      </span>
      <span className="font-mono tabular-nums">
        {position.estimatedValueUsd === undefined
          ? "--"
          : formatUsd(position.estimatedValueUsd)}
      </span>
      <span className={cn("text-right font-mono tabular-nums", pnlClassName)}>
        {position.estimatedPnlUsd === undefined
          ? "--"
          : `${formatPnlUsd(position.estimatedPnlUsd)} (${formatPnlPercent(
              position.estimatedPnlPercent ?? 0
            )})`}
      </span>
      <span className="text-right font-mono text-muted-foreground tabular-nums uppercase">
        {position.settled ? "Settled" : "Active"}
      </span>
    </div>
  )
}

function TermsContent({ product }: { product: ShieldProduct }) {
  return (
    <div className="space-y-2">
      <PanelRow label="Deposit asset" value="DUSDC" />
      <PanelRow label="Yield source" value="Predict PLP" />
      <PanelRow label="Tenor" value={getShieldTenorLabel(product.tenor)} />
      <PanelRow
        label="Protection"
        value={`Below ${formatUsd(product.protectionStrikeUsd, 0)}`}
      />
      <PanelRow label="Hedge type" value="Binary DOWN" />
      <PanelRow label="Budget" value={`≤${product.hedgeBudgetBps / 100}%`} />
    </div>
  )
}

function RiskContent() {
  return (
    <div className="grid gap-2 text-sm leading-6 text-muted-foreground md:grid-cols-2">
      <p>Max loss bps limits hedge budget, not total strategy loss.</p>
      <p>Shield v1 uses binary DOWN protection only.</p>
    </div>
  )
}

function PanelRow({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/30 py-2 text-sm first:pt-0 last:border-b-0 last:pb-0">
      <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={cn(
          "max-w-[65%] truncate text-right font-mono text-xs font-medium text-foreground tabular-nums",
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  )
}
