import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { ArrowLeftIcon, ShieldCheckIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router"

import { Badge, BadgeTone } from "~/components/primitives/badge"
import { AssetIcon } from "~/components/shared/market/asset-icon"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { ChartPanel } from "~/components/market-detail/chart-panel"
import { formatUsd } from "~/lib/callit/format"
import {
  getShieldPresetLabel,
  getShieldProductHref,
} from "~/lib/callit/shield/products"
import { type ShieldProduct } from "~/lib/callit/shield/types"
import { cn } from "~/lib/utils"

export interface DetailPageProps {
  product: ShieldProduct
  relatedProducts: ShieldProduct[]
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

function formatSignedPercent(value: number) {
  const displayValue = Math.abs(value) < 0.005 ? 0 : value

  return `${displayValue >= 0 ? "+" : ""}${displayValue.toFixed(2)}%`
}

function parseAmount(value: string) {
  const parsedValue = Number(value.replaceAll(",", ""))

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

export function DetailPage({ product, relatedProducts }: DetailPageProps) {
  return (
    <main className="mx-auto w-full max-w-384 px-4 py-4 sm:px-6 lg:px-8">
      <div className="mb-3">
        <Link
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          to="/shield"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to Shield
        </Link>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="min-w-0 space-y-3">
          <Header product={product} />

          <Card className="flex h-120 min-w-0 flex-col overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
            <ChartPanel
              assetName={product.market.assetName}
              assetSymbol={product.market.assetSymbol}
              oracleId={product.market.oracleId}
              points={product.market.priceHistory}
              selectedStrikePriceUsd={product.protectionStrikeUsd}
            />
            <div className="border-t border-border/40 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              Protection trigger · {formatUsd(product.protectionStrikeUsd, 0)} ·{" "}
              {formatSignedPercent(product.distancePercent)} from spot
            </div>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <TermsCard product={product} />
            <ScenarioCard product={product} />
          </div>

          <RiskCard />
        </section>

        <aside className="min-w-0 xl:sticky xl:top-20">
          <ShieldTicket product={product} relatedProducts={relatedProducts} />
        </aside>
      </div>
    </main>
  )
}

function Header({ product }: { product: ShieldProduct }) {
  return (
    <Card className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="px-3 py-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <AssetIcon
              assetIconUrl={product.market.assetIconUrl}
              assetName={product.market.assetName}
              assetSymbol={product.market.assetSymbol}
              className="size-8"
            />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-lg leading-none font-semibold tracking-tight text-foreground">
                  {product.market.assetSymbol} Shield ·{" "}
                  {getShieldPresetLabel(product.preset)}
                </h1>
                <Badge
                  className="px-2 py-0.5 font-mono text-[10px] uppercase"
                  tone={BadgeTone.Live}
                >
                  Live
                </Badge>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Protected PLP exposure with a binary DOWN hedge below{" "}
                {formatUsd(product.protectionStrikeUsd, 0)}.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto pb-1">
          <div className="flex min-w-175 items-end gap-6">
            <HeaderMetric label="Deposit Asset" value="DUSDC" />
            <HeaderMetric label="Yield Source" value="Predict PLP" />
            <HeaderMetric
              className="text-outcome-down"
              label="Protection"
              value={`Below ${formatUsd(product.protectionStrikeUsd, 0)}`}
            />
            <HeaderMetric
              label="Hedge Budget"
              value={`≤${product.hedgeBudgetBps / 100}%`}
            />
            <HeaderMetric
              label="Expires"
              value={formatExpiryDistance(product.market.expiryMs)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function HeaderMetric({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 whitespace-nowrap">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-xs leading-none font-medium text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}

function ShieldTicket({
  product,
  relatedProducts,
}: {
  product: ShieldProduct
  relatedProducts: ShieldProduct[]
}) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <ShieldTicketFrame product={product} relatedProducts={relatedProducts} />
  }

  return (
    <ShieldTicketClient product={product} relatedProducts={relatedProducts} />
  )
}

function ShieldTicketClient({
  product,
  relatedProducts,
}: {
  product: ShieldProduct
  relatedProducts: ShieldProduct[]
}) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()

  return (
    <ShieldTicketFrame
      beneficiary={primaryWallet?.address}
      onConnect={() => setShowAuthFlow(true)}
      product={product}
      relatedProducts={relatedProducts}
      walletAddress={primaryWallet?.address}
    />
  )
}

function ShieldTicketFrame({
  beneficiary,
  onConnect,
  product,
  relatedProducts,
  walletAddress,
}: {
  beneficiary?: string
  onConnect?: () => void
  product: ShieldProduct
  relatedProducts: ShieldProduct[]
  walletAddress?: string
}) {
  const [amount, setAmount] = useState("")
  const [beneficiaryInput, setBeneficiaryInput] = useState(beneficiary ?? "")
  const depositAmount = parseAmount(amount)
  const hedgeBudget = (depositAmount * product.hedgeBudgetBps) / 10_000
  const plpSupply = Math.max(depositAmount - hedgeBudget, 0)
  const buttonLabel = !walletAddress ? "Sign in" : "Open after deploy"
  const buttonDisabled = walletAddress ? true : !onConnect

  useEffect(() => {
    if (beneficiary && !beneficiaryInput) {
      setBeneficiaryInput(beneficiary)
    }
  }, [beneficiary, beneficiaryInput])

  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="flex h-full flex-col gap-4 px-4 py-4">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-foreground">
            <ShieldCheckIcon className="size-4 text-primary" />
            Open Shield
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            First release UI. Transaction wiring turns on after Shield is
            published on testnet.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Deposit
          </span>
          <div className="relative">
            <Input
              className="h-11 border-0 pr-20 font-mono shadow-none ring-0 focus-visible:ring-1"
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

        <div className="space-y-2">
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Protection
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {relatedProducts.map((relatedProduct) => {
              const isSelected = relatedProduct.id === product.id

              return (
                <Link
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md bg-muted px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                    isSelected && "bg-primary/10 text-primary hover:bg-primary/15"
                  )}
                  key={relatedProduct.id}
                  to={getShieldProductHref(relatedProduct)}
                >
                  {getShieldPresetLabel(relatedProduct.preset)}
                </Link>
              )
            })}
          </div>
          <div className="rounded-md bg-muted p-3">
            <PanelRow
              label="Trigger"
              value={`Below ${formatUsd(product.protectionStrikeUsd, 0)}`}
              valueClassName="text-outcome-down"
            />
            <PanelRow
              label="Distance"
              value={formatSignedPercent(product.distancePercent)}
              valueClassName="text-outcome-down"
            />
            <PanelRow
              label="Expires"
              value={formatExpiryDistance(product.market.expiryMs)}
            />
          </div>
        </div>

        <label className="block space-y-2">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Beneficiary
          </span>
          <Input
            className="h-10 border-0 font-mono text-xs shadow-none ring-0 focus-visible:ring-1"
            onChange={(event) => setBeneficiaryInput(event.target.value)}
            placeholder="0x..."
            value={beneficiaryInput}
          />
        </label>

        <div className="space-y-2 rounded-md bg-muted p-3">
          <PanelRow label="PLP supply" value={`~${formatAmount(plpSupply)}`} />
          <PanelRow label="Hedge budget" value={`≤${formatAmount(hedgeBudget)}`} />
          <PanelRow label="Max loss bps" value={product.hedgeBudgetBps.toString()} />
          <PanelRow label="Unused budget" value="Refunds" />
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          Keeper settlement sends the PLP withdrawal to the beneficiary. The
          hedge payout is redeemed into the owner&apos;s PredictManager.
        </p>

        <Button
          className="mt-auto h-11 w-full"
          disabled={buttonDisabled}
          onClick={walletAddress ? undefined : onConnect}
          type="button"
        >
          {buttonLabel}
        </Button>
      </CardContent>
    </Card>
  )
}

function TermsCard({ product }: { product: ShieldProduct }) {
  return (
    <InfoCard title="Terms">
      <PanelRow label="Deposit asset" value="DUSDC" />
      <PanelRow label="Yield source" value="Predict PLP" />
      <PanelRow
        label="Protection"
        value={`Below ${formatUsd(product.protectionStrikeUsd, 0)}`}
      />
      <PanelRow label="Hedge type" value="Binary DOWN" />
      <PanelRow label="Budget" value={`≤${product.hedgeBudgetBps / 100}%`} />
    </InfoCard>
  )
}

function ScenarioCard({ product }: { product: ShieldProduct }) {
  return (
    <InfoCard title="Scenarios">
      <ScenarioRow
        label="Above trigger"
        value="PLP withdraws; hedge expires worthless"
      />
      <ScenarioRow
        label="Below trigger"
        value="DOWN hedge pays into the manager"
      />
      <ScenarioRow
        label="Not settled"
        value="Claim waits for oracle settlement"
      />
      <ScenarioRow
        label="Trigger"
        value={`${product.market.assetSymbol} below ${formatUsd(product.protectionStrikeUsd, 0)}`}
      />
    </InfoCard>
  )
}

function RiskCard() {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="px-4 py-4">
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Risk notes
        </div>
        <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground md:grid-cols-2">
          <p>
            Max loss bps limits the hedge budget, not total strategy loss. PLP
            value can still move with vault liabilities and liquidity.
          </p>
          <p>
            Shield currently uses binary DOWN protection only. Range hedges and
            payout caps are intentionally excluded from the first contract.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function InfoCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-0">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-4">{children}</CardContent>
    </Card>
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

function ScenarioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm leading-5 text-foreground">{value}</div>
    </div>
  )
}
