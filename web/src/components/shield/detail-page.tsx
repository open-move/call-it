import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { ShieldCheckIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { BadgeTone } from "@/components/primitives/badge"
import { ProtectionFamilyHeader } from "@/components/protection/family-header"
import { DetailChartCard } from "@/components/shared/detail/detail-chart-card"
import { DetailTabs } from "@/components/shared/detail/detail-tabs"
import {
  TicketCard,
  TicketMessage,
  TicketRow,
  TicketSection,
} from "@/components/shared/ticket/ticket"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { QUOTE_SCALE, PREDICT_QUOTE_DECIMALS  } from "@/lib/config"
import { formatExpiryDistance, formatRelativeTime, formatSignedUsd, formatUsd } from "@/lib/format"
import type {ExpiryOption} from "@/lib/types/market";
import {
  getShieldProductHref,
  getShieldTenorLabel,
} from "@/lib/shield-products"
import type {ShieldProduct} from "@/lib/types/shield";
import {
  formatDecimalUnits,
  parseDecimalUnits,
} from "@/lib/amounts"
import {
  getManagerPositionSummaries,
  getOracleState,
  getPredictVaultSummary,
} from "@/services/predict-client"
import {
  getShieldPositions
  
} from "@/services/shield-client"
import type {ShieldPositionRow} from "@/services/shield-client";
import { formatPredictTradeError } from "@/services/predict-quotes"
import {
  prepareShieldClaimTransaction,
  prepareShieldOpenTransaction,
  prepareShieldSettleTransaction,
} from "@/services/shield-transactions"
import {
  executeSuiTransaction,
} from "@/services/predict-transactions"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import type {ManagerPositionSummary} from "@/lib/types/predict";
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { usePredictAccount } from "@/lib/providers/predict-account"
import { cn } from "@/lib/utils"

interface EstimatedShieldPosition extends ShieldPositionRow {
  estimatedPnlPercent?: number
  estimatedPnlUsd?: number
  estimatedValueUsd?: number
  hedgeValueUsd?: number
  oracleStatus?: string
  plpValueUsd?: number
}

type ShieldLifecycleAction = "claim" | "settle"

interface ShieldActionState {
  action?: ShieldLifecycleAction
  errorMessage?: string
  isExecuting?: boolean
  message?: string
  positionId?: string
}

export interface DetailPageProps {
  expiryProducts: ShieldProduct[]
  product: ShieldProduct
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
  return value / QUOTE_SCALE
}

function toQuoteAmountFromBigInt(value: bigint) {
  return Number(value) / QUOTE_SCALE
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

export function DetailPage({ expiryProducts, product }: DetailPageProps) {
  const expiryOptions = getShieldExpiryOptions(expiryProducts)
  const [positionRefreshKey, setPositionRefreshKey] = useState(0)

  return (
    <main className="mx-auto w-full max-w-384 px-4 py-4 sm:px-6 lg:px-8">
      <div className="mb-3">
        <ProtectionFamilyHeader
          actions={[
            { href: "/shield/claims", label: "Claims" },
            { href: "/shield", label: "All Shield products" },
          ]}
          description={`Product 0 · Yield Shield / Hedged PLP Note. ${product.market.assetSymbol} protection below ${formatUsd(product.protectionStrikeUsd, 0)} with a hedge budget capped at ${product.hedgeBudgetBps / 100}%.`}
          title="Shield"
        />
      </div>

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
  const refreshRoute = useAppRouteRefresh()

  return (
    <ShieldTicketFrame
      onOpened={onOpened}
      onConnect={() => setShowAuthFlow(true)}
      product={product}
      revalidate={refreshRoute}
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
  const predictAccount = usePredictAccount()
  const [amount, setAmount] = useState("")
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
      : predictAccount.status === "loading"
        ? "Loading account"
      : "Open Shield"
  const buttonDisabled = walletAddress
    ? isSubmitting || predictAccount.status === "loading" || !depositAmount
    : !onConnect

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
      const hadManager = Boolean(predictAccount.managerId)

      if (!hadManager) {
        setStatusMessage("Creating trading account")
      }

      const managerId = await predictAccount.ensureManager(signer)

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
      void predictAccount.refreshAccount()
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
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const refreshRoute = useAppRouteRefresh()
  const walletAddress = primaryWallet?.address
  const [actionState, setActionState] = useState<ShieldActionState>({})
  const [errorMessage, setErrorMessage] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const [positions, setPositions] = useState<EstimatedShieldPosition[]>([])
<<<<<<< HEAD
  const [claimingOwnerCapId, setClaimingOwnerCapId] = useState<string>()
  const refreshRoute = useAppRouteRefresh()
=======
  const [positionRefreshNonce, setPositionRefreshNonce] = useState(0)

  async function executeShieldLifecycle(
    position: EstimatedShieldPosition,
    action: ShieldLifecycleAction
  ) {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setActionState({
        action,
        errorMessage: RECONNECT_SUI_WALLET_MESSAGE,
        positionId: position.ownerCapId,
      })
      setShowAuthFlow(true)
      return
    }

    if (position.settled) {
      setActionState({
        action,
        errorMessage: "This Shield policy is already settled.",
        positionId: position.ownerCapId,
      })
      return
    }

    if (position.oracleStatus !== "settled") {
      setActionState({
        action,
        errorMessage: "This Shield can only be claimed after the Predict market settles.",
        positionId: position.ownerCapId,
      })
      return
    }

    setActionState({
      action,
      isExecuting: true,
      message: action === "claim" ? "Preparing claim." : "Preparing settlement.",
      positionId: position.ownerCapId,
    })

    try {
      const transaction =
        action === "claim"
          ? await prepareShieldClaimTransaction({
              managerId: position.managerId,
              oracleId: position.oracleId,
              ownerCapId: position.ownerCapId,
              policyId: position.policyId,
              walletAddress,
            })
          : await prepareShieldSettleTransaction({
              managerId: position.managerId,
              oracleId: position.oracleId,
              policyId: position.policyId,
              walletAddress,
            })

      setActionState({
        action,
        isExecuting: true,
        message: "Wallet approval requested.",
        positionId: position.ownerCapId,
      })

      await executeSuiTransaction(signer, transaction)

      setActionState({
        action,
        message:
          action === "claim"
            ? "Shield claim confirmed."
            : "Shield settlement confirmed.",
        positionId: position.ownerCapId,
      })
      setPositionRefreshNonce((currentNonce) => currentNonce + 1)
      refreshRoute()
      window.setTimeout(refreshRoute, 1_500)
    } catch (error) {
      setActionState({
        action,
        errorMessage: formatPredictTradeError(
          error,
          action === "claim" ? "Shield claim failed" : "Shield settlement failed"
        ),
        positionId: position.ownerCapId,
      })
    }
  }
>>>>>>> 0f57973 (add the remaining callit packages)

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
        const [enrichedResult, oracleStateResult] = await Promise.allSettled([
          enrichShieldPositions(marketPositions),
          getOracleState(product.market.oracleId),
        ])
        const oracleStatus =
          oracleStateResult.status === "fulfilled"
            ? oracleStateResult.value.oracle.status
            : product.market.status
        const enrichedPositions =
          enrichedResult.status === "fulfilled"
            ? enrichedResult.value.map((position) => ({
                ...position,
                oracleStatus,
              }))
            : marketPositions.map((position) => ({ ...position, oracleStatus }))

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
  }, [positionRefreshNonce, product.market.oracleId, product.market.status, refreshKey, walletAddress])

  async function handleClaim(position: EstimatedShieldPosition) {
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

    setClaimingOwnerCapId(position.ownerCapId)
    setErrorMessage(undefined)

    try {
      const transaction = buildShieldClaimTransaction({
        managerId: position.managerId,
        oracleId: position.oracleId,
        ownerCapId: position.ownerCapId,
        policyId: position.policyId,
        walletAddress,
      })

      await executeSuiTransaction(signer, transaction)
      refreshRoute()
      window.setTimeout(() => refreshRoute(), 1_500)
    } catch (error) {
      setErrorMessage(formatPredictTradeError(error, "Claim Shield failed"))
    } finally {
      setClaimingOwnerCapId(undefined)
    }
  }

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
          <ShieldPositionRowView
            actionState={actionState}
            key={position.ownerCapId}
            onAction={(action) => void executeShieldLifecycle(position, action)}
            position={position}
          />
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
    <div className="grid grid-cols-[minmax(12rem,1.8fr)_7rem_6rem_6rem_7rem_7rem_5.5rem_8rem] gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
      <span>Shield</span>
      <span>Deposit</span>
      <span>PLP</span>
      <span>Hedge</span>
      <span>Est. Value</span>
      <span className="text-right">Est. PnL</span>
      <span className="text-right">Status</span>
      <span className="text-right">Action</span>
    </div>
  )
}

function ShieldPositionRowView({
  actionState,
  onAction,
  position,
}: {
  actionState: ShieldActionState
  onAction: (action: ShieldLifecycleAction) => void
  position: EstimatedShieldPosition
}) {
  const isActionActive = actionState.positionId === position.ownerCapId
  const isExecuting = isActionActive && actionState.isExecuting
  const canAct = !position.settled && position.oracleStatus === "settled"
  const pnlClassName =
    position.estimatedPnlUsd === undefined
      ? "text-muted-foreground"
      : position.estimatedPnlUsd > 0
        ? "text-outcome-up"
        : position.estimatedPnlUsd < 0
          ? "text-outcome-down"
          : "text-muted-foreground"

  return (
    <div className="grid grid-cols-[minmax(12rem,1.8fr)_7rem_6rem_6rem_7rem_7rem_5.5rem_8rem] gap-4 border-b border-border/35 px-3 py-2.5 text-xs">
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
        {position.settled
          ? "Settled"
          : position.oracleStatus === "settled"
            ? "Claimable"
            : "Active"}
      </span>
      <div className="flex justify-end gap-1">
        <Button
          disabled={!canAct || isExecuting}
          onClick={() => onAction("claim")}
          size="xs"
          type="button"
        >
          {isExecuting && actionState.action === "claim" ? "Claiming" : "Claim"}
        </Button>
        <Button
          disabled={!canAct || isExecuting}
          onClick={() => onAction("settle")}
          size="xs"
          type="button"
          variant="outline"
        >
          {isExecuting && actionState.action === "settle" ? "Settling" : "Settle"}
        </Button>
      </div>
      {isActionActive && (actionState.errorMessage || actionState.message) && (
        <div
          className={cn(
            "col-span-full -mt-1 font-mono text-[10px]",
            actionState.errorMessage ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {actionState.errorMessage ?? actionState.message}
        </div>
      )}
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
      <p>Shield is a fixed-budget hedge, not principal protection.</p>
      <p>PLP value can fall and the hedge may expire worthless.</p>
      <p>Max loss bps limits hedge budget, not total strategy loss.</p>
      <p>Settlement and claim availability depend on Predict market state.</p>
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
