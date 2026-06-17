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
import { PREDICT_QUOTE_DECIMALS, QUOTE_SCALE } from "@/lib/config"
import { formatExpiryDistance, formatRelativeTime, formatUsd } from "@/lib/format"
import type { ExpiryOption } from "@/lib/types/market"
import {
  getShieldProductHref,
  getShieldTenorLabel,
} from "@/lib/shield-products"
import type { ShieldProduct } from "@/lib/types/shield"
import {
  formatDecimalUnits,
  parseDecimalUnits,
} from "@/lib/amounts"
import {
  getManagerPositionSummaries,
  getOracleState,
  getPredictVaultSummary,
} from "@/services/predict-client"
import { getShieldPositions } from "@/services/shield-client"
import type { ShieldPositionRow } from "@/services/shield-client"
import { formatPredictTradeError } from "@/services/predict-quotes"
import {
  prepareShieldClaimTransaction,
  prepareShieldOpenTransaction,
} from "@/services/shield-transactions"
import { executeSuiTransaction } from "@/services/predict-transactions"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import type { ManagerPositionSummary } from "@/lib/types/predict"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { usePredictAccount } from "@/lib/providers/predict-account"
import { cn } from "@/lib/utils"
import { getOwnedTicketClaimStatus } from "@/services/owned-ticket-bcs"

interface EstimatedShieldPosition extends ShieldPositionRow {
  estimatedValueUsd?: number
  hedgeValueUsd?: number
  oracleStatus?: string
  plpValueUsd?: number
}

type ShieldLifecycleAction = "claim"

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
      summary.is_up === position.isUp &&
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
    if (!vaultSummary) {
      return position
    }

    const hedgeSummary = getHedgeSummary(position, summaries)

    if (!hedgeSummary || hedgeSummary.mark_value === null) {
      return position
    }

    const plpValueUsd =
      toQuoteAmountFromBigInt(position.plpAmount) * vaultSummary.plp_share_price
    const hedgeValueUsd = toQuoteAmount(hedgeSummary.mark_value)
    const estimatedValueUsd = plpValueUsd + hedgeValueUsd

    return {
      ...position,
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
          description={`Product 0 · owned Yield Shield ticket. ${product.market.assetSymbol} protection below ${formatUsd(product.protectionStrikeUsd, 0)} with a hedge budget capped at ${product.hedgeBudgetBps / 100}%.`}
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

        <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Opening creates an owned Shield policy in your wallet. Claim consumes
          that policy after settlement and pays the returned DUSDC to you.
        </div>

        <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-200/90">
          Keep the manager&apos;s matching DOWN position unchanged. Manual trades on
          the same oracle, expiry, strike, and side can make the policy claim
          abort.
        </div>

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
  const [positionRefreshNonce, setPositionRefreshNonce] = useState(0)

  async function executeShieldClaim(position: EstimatedShieldPosition) {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setActionState({
        action: "claim",
        errorMessage: RECONNECT_SUI_WALLET_MESSAGE,
        positionId: position.policyId,
      })
      setShowAuthFlow(true)
      return
    }

    if (getOwnedTicketClaimStatus(position.oracleStatus) !== "claimable") {
      setActionState({
        action: "claim",
        errorMessage: "This Shield can only be claimed after the Predict market settles.",
        positionId: position.policyId,
      })
      return
    }

    setActionState({
      action: "claim",
      isExecuting: true,
      message: "Preparing claim.",
      positionId: position.policyId,
    })

    try {
      const transaction = await prepareShieldClaimTransaction({
        managerId: position.managerId,
        oracleId: position.oracleId,
        policyId: position.policyId,
        walletAddress,
      })

      setActionState({
        action: "claim",
        isExecuting: true,
        message: "Wallet approval requested.",
        positionId: position.policyId,
      })

      await executeSuiTransaction(signer, transaction)

      setActionState({
        action: "claim",
        message: "Shield claim confirmed.",
        positionId: position.policyId,
      })
      setPositionRefreshNonce((currentNonce) => currentNonce + 1)
      refreshRoute()
      window.setTimeout(refreshRoute, 1_500)
    } catch (error) {
      setActionState({
        action: "claim",
        errorMessage: formatPredictTradeError(error, "Shield claim failed"),
        positionId: position.policyId,
      })
    }
  }

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
  }, [
    positionRefreshNonce,
    product.market.oracleId,
    product.market.status,
    refreshKey,
    walletAddress,
  ])

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
            key={position.policyId}
            onClaim={() => void executeShieldClaim(position)}
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
    <div className="grid grid-cols-[minmax(12rem,1.8fr)_7rem_7rem_7rem_7rem_5.5rem_6rem] gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
      <span>Shield</span>
      <span>PLP</span>
      <span>Hedge Qty</span>
      <span>Hedge Mark</span>
      <span>Est. Value</span>
      <span className="text-right">Status</span>
      <span className="text-right">Action</span>
    </div>
  )
}

function ShieldPositionRowView({
  actionState,
  onClaim,
  position,
}: {
  actionState: ShieldActionState
  onClaim: () => void
  position: EstimatedShieldPosition
}) {
  const isActionActive = actionState.positionId === position.policyId
  const isExecuting = isActionActive && actionState.isExecuting
  const claimStatus = getOwnedTicketClaimStatus(position.oracleStatus)
  const canClaim = claimStatus === "claimable"

  return (
    <div className="grid grid-cols-[minmax(12rem,1.8fr)_7rem_7rem_7rem_7rem_5.5rem_6rem] gap-4 border-b border-border/35 px-3 py-2.5 text-xs">
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
        {formatDusdc(position.plpAmount)}
      </span>
      <span className="font-mono tabular-nums">
        {formatDusdc(position.hedgeQuantity)}
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
      <span className="text-right font-mono text-muted-foreground tabular-nums uppercase">
        {claimStatus === "claimable" ? "Claimable" : "Active"}
      </span>
      <div className="flex justify-end gap-1">
        <Button
          disabled={!canClaim || isExecuting}
          onClick={onClaim}
          size="xs"
          type="button"
        >
          {isExecuting && actionState.action === "claim" ? "Claiming" : "Claim"}
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
      <PanelRow label="Ticket" value="Owned policy, consumed on claim" />
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
      <p>Manual same-key trades can change the reserved manager position.</p>
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
