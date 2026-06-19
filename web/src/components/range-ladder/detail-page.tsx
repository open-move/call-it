import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Link } from "@tanstack/react-router"
import { Layers3Icon } from "lucide-react"
import { useEffect, useState } from "react"

import { BadgeTone } from "@/components/primitives/badge"
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
import { getRangeLadderPresetLabel } from "@/lib/range-ladder-products"
import type { ExpiryOption } from "@/lib/types/market"
import type { RangeLadderProduct } from "@/lib/types/range-ladder"
import { cn } from "@/lib/utils"
import { formatPredictTradeError } from "@/services/predict-quotes"
import { executeSuiTransaction } from "@/services/predict-transactions"
import { prepareRangeLadderOpenTransaction } from "@/services/range-ladder-transactions"

export interface DetailPageProps {
  expiryProducts: RangeLadderProduct[]
  product: RangeLadderProduct
}

function getRangeLadderProductHref(product: RangeLadderProduct) {
  const searchParams = new URLSearchParams({
    preset: product.preset,
  })

  return `/range-ladder/${product.market.oracleId}?${searchParams.toString()}`
}

function getRangeLadderExpiryOptions(
  products: RangeLadderProduct[]
): ExpiryOption[] {
  return products.map((product) => ({
    assetSymbol: product.market.assetSymbol,
    expiryMs: product.market.expiryMs,
    oracleId: product.market.oracleId,
    status: product.market.status,
  }))
}

function getDeepestStrikeUsd(product: RangeLadderProduct) {
  return Math.min(...product.rungs.map((rung) => rung.lowerStrikeUsd))
}

export function DetailPage({ expiryProducts, product }: DetailPageProps) {
  const expiryOptions = getRangeLadderExpiryOptions(expiryProducts)
  const topBand = product.rungs[0]
  const deepestStrikeUsd = getDeepestStrikeUsd(product)
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0)

  return (
    <main className="mx-auto w-full max-w-384 px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="grid min-w-0 gap-3">
          <div className="h-120 min-w-0">
            <DetailChartCard
              assetIconUrl={product.market.assetIconUrl}
              assetName={product.market.assetName}
              assetSymbol={product.market.assetSymbol}
              badgeLabel="Live"
              badgeTone={BadgeTone.Live}
              expiryOptions={expiryOptions}
              getExpiryHref={(option) =>
                getRangeLadderProductHref(
                  expiryProducts.find(
                    (expiryProduct) =>
                      expiryProduct.market.oracleId === option.oracleId
                  ) ?? product
                )
              }
              metrics={[
                {
                  label: "Preset",
                  value: getRangeLadderPresetLabel(product.preset),
                },
                { label: "Rungs", value: product.rungs.length.toString() },
                {
                  className: "text-outcome-down",
                  label: "Deepest",
                  value: formatSignedPercent(product.distancePercent),
                },
                {
                  label: "Top Band",
                  value: topBand
                    ? `${formatUsd(topBand.lowerStrikeUsd, 0)} - ${formatUsd(topBand.higherStrikeUsd, 0)}`
                    : "--",
                },
                {
                  label: "Expires",
                  value: formatExpiryDistance(product.market.expiryMs),
                },
              ]}
              points={product.market.priceHistory}
              referenceLabel="Deepest"
              referencePriceUsd={deepestStrikeUsd}
              selectedOracleId={product.market.oracleId}
              title={`${product.market.assetSymbol} Ladder · ${getRangeLadderPresetLabel(product.preset)}`}
            />
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Layers3Icon className="size-4 text-primary" />
                Rung rail
              </div>
              <span className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                Read-only builder
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {product.rungs.map((rung, index) => (
                <div
                  className="relative rounded-md border border-border/60 bg-background/45 p-3"
                  key={`${rung.lowerStrikeUsd}-${rung.higherStrikeUsd}`}
                >
                  <span className="absolute top-3 right-3 font-mono text-[10px] text-muted-foreground">
                    0{index + 1}
                  </span>
                  <div className="font-mono text-sm text-foreground">
                    {formatUsd(rung.lowerStrikeUsd, 0)} -{" "}
                    {formatUsd(rung.higherStrikeUsd, 0)}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Cost {rung.costTier}</span>
                    <span>{rung.weight}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="flex h-full min-w-0 flex-col gap-3">
          <RangeLadderTicket
            key={`${product.id}-${ticketRefreshKey}`}
            onOpened={() => setTicketRefreshKey((key) => key + 1)}
            product={product}
          />

          <div className="rounded-2xl border border-border/70 bg-card/70 p-4 text-sm leading-6 text-muted-foreground">
            Claim consumes the owned RangeLadderPolicy and redeems every stored
            RangePosition. Manual same-range manager trades can block claim.
          </div>

          <Link
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "justify-center"
            )}
            to="/range-ladder/claims"
          >
            View Range Ladder claims
          </Link>
        </aside>
      </div>
    </main>
  )
}

function formatDusdc(value: bigint) {
  return `${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)} DUSDC`
}

function RangeLadderTicket({
  onOpened,
  product,
}: {
  onOpened?: () => void
  product: RangeLadderProduct
}) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <RangeLadderTicketFrame onOpened={onOpened} product={product} />
  }

  return <RangeLadderTicketClient onOpened={onOpened} product={product} />
}

function RangeLadderTicketClient({
  onOpened,
  product,
}: {
  onOpened?: () => void
  product: RangeLadderProduct
}) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const refreshRoute = useAppRouteRefresh()

  return (
    <RangeLadderTicketFrame
      onConnect={() => setShowAuthFlow(true)}
      onOpened={onOpened}
      product={product}
      revalidate={refreshRoute}
      wallet={primaryWallet}
      walletAddress={primaryWallet?.address}
    />
  )
}

function RangeLadderTicketFrame({
  onConnect,
  onOpened,
  product,
  revalidate,
  wallet,
  walletAddress,
}: {
  onConnect?: () => void
  onOpened?: () => void
  product: RangeLadderProduct
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
  const perRungQuantity = parseDecimalUnits(amount, PREDICT_QUOTE_DECIMALS)
  const buttonLabel = !walletAddress
    ? "Sign in"
    : isSubmitting
      ? "Submitting"
      : predictAccount.status === "loading"
        ? "Loading account"
        : "Open Ladder"
  const buttonDisabled = walletAddress
    ? isSubmitting || predictAccount.status === "loading" || !perRungQuantity
    : !onConnect

  async function handleOpenRangeLadder() {
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

    if (!perRungQuantity) {
      setErrorMessage("Enter a positive per-rung quantity")
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

      setStatusMessage("Preparing Range Ladder")
      const preparedOpen = await prepareRangeLadderOpenTransaction({
        expiryMs: product.market.expiryMs,
        managerId,
        oracleId: product.market.oracleId,
        rungs: product.rungs.map((rung) => ({
          higherStrikeUsd: rung.higherStrikeUsd,
          lowerStrikeUsd: rung.lowerStrikeUsd,
          quantity: perRungQuantity,
        })),
        walletAddress,
      })

      setStatusMessage(
        `Opening ladder with ${formatDusdc(
          preparedOpen.maxPremiumAmount
        )} max premium`
      )
      await executeSuiTransaction(signer, preparedOpen.transaction)

      setAmount("")
      setStatusKind("success")
      setStatusMessage("Range Ladder opened")
      void predictAccount.refreshAccount()
      onOpened?.()
      revalidate?.()
      window.setTimeout(() => revalidate?.(), 1_500)
    } catch (error) {
      setStatusKind("neutral")
      setStatusMessage(undefined)
      setErrorMessage(
        formatPredictTradeError(error, "Open Range Ladder failed")
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <TicketCard>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Layers3Icon className="size-3.5 text-primary" />
        Open Range Ladder
      </div>

      <label className="block space-y-2">
        <span className="text-xs text-muted-foreground">Per-rung quantity</span>
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
        <TicketRow label="Rungs" value={product.rungs.length.toString()} />
        <TicketRow
          label="Per-rung qty"
          value={perRungQuantity ? formatDusdc(perRungQuantity) : "--"}
        />
        <TicketRow
          label="Bands"
          value={product.rungs
            .map(
              (rung) =>
                `${formatUsd(rung.lowerStrikeUsd, 0)}-${formatUsd(rung.higherStrikeUsd, 0)}`
            )
            .join(", ")}
        />
      </TicketSection>

      <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
        The app quotes every range rung, pays a buffered premium, and the
        contract refunds unused DUSDC in the same transaction.
      </div>

      <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-200/90">
        Keep all matching manager range positions unchanged. Manual same-range
        trades can make the policy claim abort.
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
        onClick={handleOpenRangeLadder}
        type="button"
      >
        {buttonLabel}
      </Button>
    </TicketCard>
  )
}
