import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Link } from "@tanstack/react-router"
import { TrendingDownIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { BadgeTone } from "@/components/primitives/badge"
import { ProtectionFamilyHeader } from "@/components/protection/family-header"
import { DetailChartCard } from "@/components/shared/detail/detail-chart-card"
import {
  TicketCard,
  TicketMessage,
  TicketRow,
  TicketSection,
} from "@/components/shared/ticket/ticket"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDecimalUnits, parseDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import {
  RECONNECT_SUI_WALLET_MESSAGE,
  getReadySuiTransactionSigner,
} from "@/lib/dynamic/sui-wallet"
import {
  formatExpiryDistance,
  formatSignedPercent,
  formatUsd,
} from "@/lib/format"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { usePredictAccount } from "@/lib/providers/predict-account"
import { getProtectPresetLabel } from "@/lib/protect-products"
import type { ExpiryOption } from "@/lib/types/market"
import type { ProtectProduct } from "@/lib/types/protect"
import { cn } from "@/lib/utils"
import { formatPredictTradeError } from "@/services/predict-quotes"
import { executeSuiTransaction } from "@/services/predict-transactions"
import { prepareProtectOpenTransaction } from "@/services/protect-transactions"

export interface DetailPageProps {
  expiryProducts: ProtectProduct[]
  product: ProtectProduct
}

function getProtectProductHref(product: ProtectProduct) {
  const searchParams = new URLSearchParams({
    preset: product.preset,
    strike: product.triggerStrikeUsd.toString(),
  })

  return `/protect/${product.market.oracleId}?${searchParams.toString()}`
}

function getProtectExpiryOptions(products: ProtectProduct[]): ExpiryOption[] {
  return products.map((product) => ({
    assetSymbol: product.market.assetSymbol,
    expiryMs: product.market.expiryMs,
    oracleId: product.market.oracleId,
    status: product.market.status,
  }))
}

export function DetailPage({ expiryProducts, product }: DetailPageProps) {
  const expiryOptions = getProtectExpiryOptions(expiryProducts)
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0)

  return (
    <main className="mx-auto w-full max-w-384 px-4 py-4 sm:px-6 lg:px-8">
      <div className="mb-3">
        <ProtectionFamilyHeader
          actions={[
            { href: "/protect/claims", label: "Claims" },
            { href: "/protect", label: "All Protect" },
          ]}
          description={`Product 1 · pure ${product.market.assetSymbol} DOWN hedge below ${formatUsd(product.triggerStrikeUsd, 0)}. Opens an owned ProtectionPolicy ticket backed by a reserved Predict position.`}
          title="Protect"
        />
      </div>

      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="h-120 min-w-0">
          <DetailChartCard
            assetIconUrl={product.market.assetIconUrl}
            assetName={product.market.assetName}
            assetSymbol={product.market.assetSymbol}
            badgeLabel="Live"
            badgeTone={BadgeTone.Live}
            expiryOptions={expiryOptions}
            getExpiryHref={(option) =>
              getProtectProductHref(
                expiryProducts.find(
                  (expiryProduct) =>
                    expiryProduct.market.oracleId === option.oracleId
                ) ?? product
              )
            }
            metrics={[
              { label: "Direction", value: "DOWN" },
              {
                className: "text-outcome-down",
                label: "Trigger",
                value: `Below ${formatUsd(product.triggerStrikeUsd, 0)}`,
              },
              {
                className: "text-outcome-down",
                label: "Distance",
                value: formatSignedPercent(product.distancePercent),
              },
              {
                label: "Preset",
                value: getProtectPresetLabel(product.preset),
              },
              {
                label: "Expires",
                value: formatExpiryDistance(product.market.expiryMs),
              },
            ]}
            points={product.market.priceHistory}
            referenceLabel="Trigger"
            referencePriceUsd={product.triggerStrikeUsd}
            selectedOracleId={product.market.oracleId}
            title={`${product.market.assetSymbol} Protect · ${getProtectPresetLabel(product.preset)}`}
          />
        </section>

        <aside className="flex h-full min-w-0 flex-col gap-3">
          <ProtectTicket
            key={`${product.id}-${ticketRefreshKey}`}
            onOpened={() => setTicketRefreshKey((key) => key + 1)}
            product={product}
          />

          <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <TrendingDownIcon className="size-4 text-outcome-down" />
              Ticket terms
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              <p>Premium paid in DUSDC for one reserved DOWN hedge.</p>
              <p>Owned ProtectionPolicy transfers to the wallet on open.</p>
              <p>Claim consumes the policy after Predict settlement.</p>
              <p>Manual same-key manager trades can block claim.</p>
            </div>
          </div>

          <Link
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "justify-center"
            )}
            to="/protect/claims"
          >
            View Protect claims
          </Link>
        </aside>
      </div>
    </main>
  )
}

function formatDusdc(value: bigint) {
  return `${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)} DUSDC`
}

function ProtectTicket({
  onOpened,
  product,
}: {
  onOpened?: () => void
  product: ProtectProduct
}) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <ProtectTicketFrame onOpened={onOpened} product={product} />
  }

  return <ProtectTicketClient onOpened={onOpened} product={product} />
}

function ProtectTicketClient({
  onOpened,
  product,
}: {
  onOpened?: () => void
  product: ProtectProduct
}) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const refreshRoute = useAppRouteRefresh()

  return (
    <ProtectTicketFrame
      onConnect={() => setShowAuthFlow(true)}
      onOpened={onOpened}
      product={product}
      revalidate={refreshRoute}
      wallet={primaryWallet}
      walletAddress={primaryWallet?.address}
    />
  )
}

function ProtectTicketFrame({
  onConnect,
  onOpened,
  product,
  revalidate,
  wallet,
  walletAddress,
}: {
  onConnect?: () => void
  onOpened?: () => void
  product: ProtectProduct
  revalidate?: () => void
  wallet?: unknown
  walletAddress?: string
}) {
  const predictAccount = usePredictAccount()
  const [amount, setAmount] = useState("")
  const [errorMessage, setErrorMessage] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusKind, setStatusKind] = useState<"neutral" | "success">("neutral")
  const [statusMessage, setStatusMessage] = useState<string>()
  const quantity = parseDecimalUnits(amount, PREDICT_QUOTE_DECIMALS)
  const buttonLabel = !walletAddress
    ? "Sign in"
    : isSubmitting
      ? "Submitting"
      : predictAccount.status === "loading"
        ? "Loading account"
        : "Open Protect"
  const buttonDisabled = walletAddress
    ? isSubmitting || predictAccount.status === "loading" || !quantity
    : !onConnect

  async function handleOpenProtect() {
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

    if (!quantity) {
      setErrorMessage("Enter a positive Protect quantity")
      return
    }

    setErrorMessage(undefined)
    setIsSubmitting(true)
    setStatusKind("neutral")

    try {
      if (!predictAccount.managerId) {
        setStatusMessage("Creating trading account")
      }

      const managerId = await predictAccount.ensureManager(signer)

      setStatusMessage("Preparing Protect")
      const preparedOpen = await prepareProtectOpenTransaction({
        expiryMs: product.market.expiryMs,
        isUp: false,
        managerId,
        oracleId: product.market.oracleId,
        quantity,
        triggerStrikeUsd: product.triggerStrikeUsd,
        walletAddress,
      })

      setStatusMessage(
        `Opening Protect with ${formatDusdc(
          preparedOpen.maxPremiumAmount
        )} max premium`
      )
      await executeSuiTransaction(signer, preparedOpen.transaction)

      setAmount("")
      setStatusKind("success")
      setStatusMessage("Protect opened")
      void predictAccount.refreshAccount()
      onOpened?.()
      revalidate?.()
      window.setTimeout(() => revalidate?.(), 1_500)
    } catch (error) {
      setStatusKind("neutral")
      setStatusMessage(undefined)
      setErrorMessage(formatPredictTradeError(error, "Open Protect failed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <TicketCard>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <TrendingDownIcon className="size-3.5 text-outcome-down" />
        Open Protect
      </div>

      <label className="block space-y-2">
        <span className="text-xs text-muted-foreground">
          Protected quantity
        </span>
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
        <TicketRow label="Direction" value="DOWN" />
        <TicketRow
          label="Trigger"
          value={`Below ${formatUsd(product.triggerStrikeUsd, 0)}`}
        />
        <TicketRow
          label="Quantity"
          value={quantity ? formatDusdc(quantity) : "--"}
        />
      </TicketSection>

      <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
        The wallet pays a quoted premium plus a small buffer; unused DUSDC is
        refunded by the Protect contract in the same transaction.
      </div>

      <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-200/90">
        Keep the manager&apos;s matching DOWN position unchanged. Manual
        same-key trades can make claim abort.
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
        onClick={handleOpenProtect}
        type="button"
      >
        {buttonLabel}
      </Button>
    </TicketCard>
  )
}
