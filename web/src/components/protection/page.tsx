import { Link } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  Layers3Icon,
  ShieldCheckIcon,
  TicketCheckIcon,
  TrendingDownIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ProtectionHref = "/range-ladder" | "/shield" | "/protect"
type ClaimsHref = "/range-ladder/claims" | "/shield/claims" | "/protect/claims"
type ProductTone = "down" | "primary" | "up"

interface ProtectionProductRow {
  actionLabel: string
  claimModel: string
  claimsHref: ClaimsHref
  code: string
  description: string
  exposure: string
  href: ProtectionHref
  mechanic: string
  name: string
  tone: ProductTone
  icon: typeof ShieldCheckIcon
}

const products = [
  {
    actionLabel: "Open Shield",
    claimModel: "Consumes ShieldPolicy",
    claimsHref: "/shield/claims",
    code: "00",
    description: "Yield ticket with a capped reserved DOWN hedge.",
    exposure: "PLP yield + hedge budget",
    href: "/shield",
    icon: ShieldCheckIcon,
    mechanic: "PLP + DOWN hedge",
    name: "Shield",
    tone: "up",
  },
  {
    actionLabel: "Open Protect",
    claimModel: "Consumes ProtectionPolicy",
    claimsHref: "/protect/claims",
    code: "01",
    description: "Standalone premium-paid downside protection.",
    exposure: "Direct DOWN hedge",
    href: "/protect",
    icon: TrendingDownIcon,
    mechanic: "Standalone hedge",
    name: "Protect",
    tone: "down",
  },
  {
    actionLabel: "Open Ladder",
    claimModel: "Consumes RangeLadderPolicy",
    claimsHref: "/range-ladder/claims",
    code: "02",
    description: "Multi-band range positions claimed together.",
    exposure: "Tiered range bands",
    href: "/range-ladder",
    icon: Layers3Icon,
    mechanic: "Range rung basket",
    name: "Range Ladder",
    tone: "primary",
  },
] satisfies ProtectionProductRow[]

const deskMetrics = [
  { label: "Products", value: "3 live" },
  { label: "Policy", value: "Owned" },
  { label: "Network", value: "Testnet" },
  { label: "Claim", value: "After settlement" },
]

const lifecycleSteps = [
  { label: "Open", value: "Pay premium or deposit" },
  { label: "Hold", value: "Wallet owns policy" },
  { label: "Settle", value: "Predict oracle resolves" },
  { label: "Claim", value: "Policy consumed" },
]

function getToneClassName(tone: ProductTone) {
  switch (tone) {
    case "down":
      return "text-outcome-down"
    case "primary":
      return "text-primary"
    case "up":
      return "text-outcome-up"
  }
}

export function Page() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <DeskHeader />
        <ProductDesk />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
          <LifecyclePanel />
          <ClaimsPanel />
        </div>
      </section>
    </main>
  )
}

function DeskHeader() {
  return (
    <div className="rounded-md bg-card px-3 py-3 shadow-none ring-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            <ShieldCheckIcon className="size-3.5 text-primary" />
            Protection Desk
          </div>
          <h1 className="mt-2 text-xl font-medium tracking-tight text-foreground">
            Owned policy products for Predict risk.
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Compare Shield, Protect, and Range Ladder, then route directly into
            product opens or owned-policy claim surfaces.
          </p>
        </div>

        <Button
          className="w-fit gap-2 bg-primary/10 text-primary shadow-none hover:bg-primary/15"
          render={<Link to="/shield" />}
          size="sm"
          variant="ghost"
        >
          Open Shield
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </div>

      <div className="mt-3 grid gap-1.5 sm:grid-cols-4">
        {deskMetrics.map((metric) => (
          <div
            className="rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5"
            key={metric.label}
          >
            <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {metric.label}
            </div>
            <div className="mt-0.5 font-mono text-xs font-medium text-foreground tabular-nums">
              {metric.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProductDesk() {
  return (
    <div className="overflow-hidden rounded-md bg-card py-0 shadow-none ring-0">
      <div className="hidden border-b border-border/40 bg-card px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:grid lg:grid-cols-[minmax(16rem,1.35fr)_1fr_1fr_1.1fr_7rem] lg:items-center">
        <div>Product</div>
        <div className="border-l border-border/25 pl-4">Mechanic</div>
        <div className="border-l border-border/25 pl-4">Exposure</div>
        <div className="border-l border-border/25 pl-4">Claim Model</div>
        <div className="border-l border-border/25 pl-4 text-right">Action</div>
      </div>

      <div>
        {products.map((product) => (
          <ProductRow key={product.name} product={product} />
        ))}
      </div>
    </div>
  )
}

function ProductRow({ product }: { product: ProtectionProductRow }) {
  const Icon = product.icon
  const toneClassName = getToneClassName(product.tone)

  return (
    <div className="border-b border-border/35 last:border-b-0">
      <div className="hidden min-h-16 px-3 py-2 transition-colors hover:bg-accent/25 lg:grid lg:grid-cols-[minmax(16rem,1.35fr)_1fr_1fr_1.1fr_7rem] lg:items-center">
        <ProductIdentity product={product} />
        <DeskCell value={product.mechanic} />
        <DeskCell value={product.exposure} />
        <DeskCell value={product.claimModel} />
        <div className="flex justify-end border-l border-border/25 pl-3">
          <ProductAction product={product} />
        </div>
      </div>

      <div className="space-y-3 px-3 py-3 lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <ProductIdentity product={product} />
          <Icon className={cn("mt-0.5 size-4 shrink-0", toneClassName)} />
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <MobileMetric label="Mechanic" value={product.mechanic} />
          <MobileMetric label="Exposure" value={product.exposure} />
          <MobileMetric label="Claim" value={product.claimModel} />
          <MobileMetric label="Policy" value="Owned ticket" />
        </div>
        <ProductAction product={product} />
      </div>
    </div>
  )
}

function ProductIdentity({ product }: { product: ProtectionProductRow }) {
  const Icon = product.icon

  return (
    <Link
      className="group flex min-w-0 items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      to={product.href}
    >
      <div
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md bg-background/60",
          getToneClassName(product.tone)
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-foreground group-hover:text-primary">
          {product.name}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          <span>{product.code}</span>
          <span>·</span>
          <span>{product.description}</span>
        </div>
      </div>
    </Link>
  )
}

function DeskCell({ value }: { value: string }) {
  return (
    <div className="border-l border-border/25 pl-3 font-mono text-xs text-foreground tabular-nums">
      {value}
    </div>
  )
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function ProductAction({ product }: { product: ProtectionProductRow }) {
  return (
    <Button
      className="min-w-24 bg-primary/10 text-xs text-primary shadow-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      render={<Link to={product.href} />}
      size="sm"
      variant="ghost"
    >
      {product.actionLabel}
    </Button>
  )
}

function LifecyclePanel() {
  return (
    <div className="rounded-md bg-card px-3 py-3 shadow-none ring-0">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
        <div className="text-sm font-medium text-foreground">Lifecycle</div>
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Open to claim
        </div>
      </div>

      <div className="mt-3 grid gap-1.5 md:grid-cols-4">
        {lifecycleSteps.map((step, index) => (
          <div
            className="rounded-md border border-border/40 bg-background/40 px-2.5 py-2"
            key={step.label}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] tracking-wide text-primary uppercase">
                0{index + 1}
              </span>
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                {step.label}
              </span>
            </div>
            <div className="mt-2 text-xs leading-5 text-foreground">
              {step.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-200/90">
        Reserved-position risk: manual trades on the same oracle, expiry,
        strike/range, and side can make policy claims abort.
      </div>
    </div>
  )
}

function ClaimsPanel() {
  return (
    <div className="rounded-md bg-card px-3 py-3 shadow-none ring-0">
      <div className="flex items-center gap-2 border-b border-border/40 pb-2 text-sm font-medium text-foreground">
        <TicketCheckIcon className="size-3.5 text-primary" />
        Claims
      </div>

      <div className="mt-3 space-y-1.5">
        {products.map((product) => (
          <Link
            className="group flex items-center justify-between gap-3 rounded-md bg-background/40 px-2.5 py-2 transition-colors hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            key={product.claimsHref}
            to={product.claimsHref}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-foreground group-hover:text-primary">
                {product.name} claims
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                Active and claimable policies
              </span>
            </span>
            <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  )
}
