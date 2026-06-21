import { Link } from "@tanstack/react-router"
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  RadioTowerIcon,
  ShieldCheckIcon,
  TrophyIcon,
  WalletIcon,
} from "lucide-react"
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import type { ReactNode } from "react"

import { AllocationBar } from "@/components/primitives/allocation-bar"
import type { AllocationSegment } from "@/components/primitives/allocation-bar"
import { Badge, BadgeTone } from "@/components/primitives/badge"
import { DataRow } from "@/components/primitives/data-row"
import { TicketRow, TicketSection } from "@/components/shared/ticket/ticket"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  formatCompactDusdc,
  useLandingStats,
} from "@/lib/landing/use-landing-stats"
import type { LandingStats } from "@/lib/landing/use-landing-stats"
import { cn } from "@/lib/utils"

const tickerItems = [
  "Settled by on-chain oracle",
  "Non-custodial",
  "No borrowing",
  "No liquidation",
  "Back the sharpest callers",
  "Automated strategy vaults",
  "BTC close markets",
]

const steps = [
  {
    n: "01",
    title: "Pick a market and a side",
    copy: "Call Up or Down on BTC by a set expiry.",
  },
  {
    n: "02",
    title: "Set your premium",
    copy: "Choose your amount — your cost and payout are fixed upfront.",
  },
  {
    n: "03",
    title: "Settle and claim",
    copy: "The oracle settles at expiry, and you claim on-chain.",
  },
]

function Eyebrow({ children }: { children: string }) {
  return (
    <span className="font-mono text-[11px] tracking-[0.18em] text-primary uppercase">
      {children}
    </span>
  )
}

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={reduce ? false : { filter: "blur(5px)", opacity: 0, y: 28 }}
      transition={{ delay, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      viewport={{ amount: 0.25, once: true }}
      whileInView={reduce ? undefined : { filter: "blur(0px)", opacity: 1, y: 0 }}
    >
      {children}
    </motion.div>
  )
}

function PrimaryCta({ children }: { children: string }) {
  return (
    <Button className="px-5" render={<Link to="/markets" />} size="lg">
      {children}
      <ArrowRightIcon />
    </Button>
  )
}

const mockFrameClassName =
  "mx-auto w-full max-w-sm rounded-lg bg-card p-4 transition-transform duration-300 ease-out hover:-translate-y-0.5"

function TradeTicketMock() {
  return (
    <div className={mockFrameClassName}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-[#f7931a] text-xs font-bold text-black">
            ₿
          </span>
          <div className="text-left">
            <div className="text-sm font-medium text-foreground">
              BTC · Above $105,000
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              Closes 14:00 UTC
            </div>
          </div>
        </div>
        <Badge tone={BadgeTone.Live}>Live</Badge>
      </div>

      <div aria-label="Direction" className="mt-4 grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between rounded-md border border-outcome-up/30 bg-outcome-up/10 px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-outcome-up">
            <ArrowUpIcon className="size-3" />
            Up
          </span>
          <span className="font-mono text-sm font-medium text-outcome-up tabular-nums">
            62%
          </span>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/35 bg-muted/25 px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <ArrowDownIcon className="size-3" />
            Down
          </span>
          <span className="font-mono text-sm font-medium text-muted-foreground tabular-nums">
            38%
          </span>
        </div>
      </div>

      <div className="mt-3">
        <TicketSection>
          <TicketRow label="Price" value="0.62 DUSDC" />
          <TicketRow label="Premium" value="50.00 DUSDC" />
          <TicketRow label="Potential payout" value="81.00 DUSDC" />
        </TicketSection>
      </div>

      <div aria-hidden="true" className={buttonVariants({ className: "mt-3 w-full" })}>
        Open Position
      </div>
    </div>
  )
}

function StrategyOverviewMock() {
  const segments = [
    { label: "PLP", pct: 0.6, tone: "primary" },
    { label: "Hedge", pct: 0.25, tone: "down" },
    { label: "Reserve", pct: 0.15, tone: "muted" },
  ] satisfies AllocationSegment[]

  return (
    <div className={mockFrameClassName}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium tracking-[-0.01em] text-foreground">
          Tail Hedge PLP
        </h3>
        <Badge tone={BadgeTone.Live}>Live</Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">NAV</div>
          <div className="mt-1 font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
            6.29 DUSDC
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-xs text-muted-foreground">hPLP price</div>
          <div className="mt-1 font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
            1.02
          </div>
        </div>
      </div>

      <div className="mt-5">
        <AllocationBar label="Capital allocation" segments={segments} />
      </div>

      <div className="mt-5">
        <DataRow label="Cash reserve" mono value="1.40 DUSDC" />
        <DataRow label="PLP deployed" mono value="3.80 DUSDC" />
        <DataRow label="hPLP supply" mono value="6.15" />
      </div>
    </div>
  )
}

function ArenaCallMock() {
  return (
    <div className={mockFrameClassName}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-400 text-[10px] font-semibold text-white">
            GL
          </span>
          <span className="truncate text-sm font-medium text-foreground">
            glyphdesk
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <TrophyIcon className="size-3 text-primary/70" />
            <span className="font-medium text-foreground tabular-nums">68%</span>
          </span>
        </div>
        <Badge tone={BadgeTone.Live}>Live</Badge>
      </div>

      <div className="mt-4 flex items-start gap-2">
        <ArrowUpIcon className="mt-0.5 size-4 shrink-0 text-outcome-up" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            BTC above $105,000
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            Closes in 3h 42m
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2.5">
        <span className="text-[11px] font-medium text-foreground tabular-nums">
          24
        </span>
        <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
          <div className="h-full bg-primary" style={{ width: "73%" }} />
          <div
            className="h-full bg-muted-foreground/35"
            style={{ width: "27%" }}
          />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
          9
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div aria-hidden="true" className={buttonVariants({ className: "w-full" })}>
          Back
        </div>
        <div
          aria-hidden="true"
          className={buttonVariants({ className: "w-full", variant: "outline" })}
        >
          Fade
        </div>
      </div>
    </div>
  )
}

function HeroMarquee() {
  const items = [...tickerItems, ...tickerItems]

  return (
    <div className="landing-marquee absolute inset-x-0 bottom-0 z-10 overflow-hidden border-t border-border/30 py-4">
      <div className="landing-ticker flex w-max items-center gap-10 pr-10 whitespace-nowrap">
        {items.map((item, index) => (
          <div
            key={`${item}-${index}`}
            className="flex items-center gap-10 font-mono text-xs tracking-wide text-muted-foreground"
          >
            <span>{item}</span>
            <span aria-hidden="true" className="text-primary/45">
              ◇
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScrollCue() {
  return (
    <button
      className="group fixed right-4 bottom-28 z-30 inline-flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground sm:right-8 sm:bottom-16"
      onClick={() =>
        window.scrollBy({ behavior: "smooth", top: window.innerHeight })
      }
      type="button"
    >
      Scroll down
      <ArrowDownIcon className="size-4 animate-bounce motion-reduce:animate-none" />
    </button>
  )
}

function Hero() {
  const reduce = useReducedMotion()
  const { scrollY } = useScroll()
  const heroScale = useTransform(scrollY, [0, 600], [1, 1.06])
  const heroOpacity = useTransform(scrollY, [0, 520], [1, 0])
  const heroBlur = useTransform(scrollY, [0, 520], ["blur(0px)", "blur(3px)"])

  return (
    <section className="relative flex min-h-[92vh] items-center justify-center overflow-hidden bg-background">
      <div aria-hidden="true" className="landing-grid" />
      <div aria-hidden="true" className="landing-stars" />
      <div aria-hidden="true" className="landing-stars landing-stars-b" />
      <div aria-hidden="true" className="landing-stars landing-stars-c" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[40rem] w-[52rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.04] blur-[150px]" />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 w-[40rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2"
      >
        <div className="landing-coin aspect-square">
          <svg
            className="h-full w-full text-foreground/20"
            fill="none"
            viewBox="0 0 480 480"
          >
            <circle
              cx="240"
              cy="240"
              r="150"
              stroke="currentColor"
              strokeDasharray="0.5 7"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
            <ellipse
              cx="240"
              cy="240"
              rx="150"
              ry="92"
              stroke="currentColor"
              strokeDasharray="0.5 7"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
            <ellipse
              cx="240"
              cy="240"
              rx="92"
              ry="150"
              stroke="currentColor"
              strokeDasharray="0.5 7"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
          </svg>
        </div>
      </div>

      <motion.div
        className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6"
        style={
          reduce
            ? undefined
            : { filter: heroBlur, opacity: heroOpacity, scale: heroScale }
        }
      >
        <Eyebrow>The hub for prediction on Sui</Eyebrow>
        <h1 className="mt-5 text-5xl leading-[1.02] font-semibold tracking-[-0.03em] text-balance text-foreground sm:text-6xl md:text-7xl">
          Make your call.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground md:text-xl">
          Call where the market heads, back the sharpest callers, or put your
          capital to work — every side of{" "}
          <span className="font-mono font-medium text-primary">
            DeepBook Predict
          </span>
          , in one place. On-chain, oracle-settled, non-custodial.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <PrimaryCta>Open app</PrimaryCta>
          <Button
            className="px-5"
            render={<Link to="/strategies" />}
            size="lg"
            variant="outline"
          >
            Explore strategies
          </Button>
        </div>
      </motion.div>

      <HeroMarquee />
    </section>
  )
}

function SectionDivider() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto max-w-[80rem] px-4 sm:px-6 lg:px-8"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-border/70 to-transparent" />
    </div>
  )
}

interface StatDef {
  label: string
  unit?: string
  render: (stats: LandingStats) => string
}

const statDefs: StatDef[] = [
  {
    label: "Vault TVL",
    render: (stats) => formatCompactDusdc(stats.vaultValue),
    unit: "DUSDC",
  },
  {
    label: "Open max payout",
    render: (stats) => formatCompactDusdc(stats.maxPayout),
    unit: "DUSDC",
  },
  {
    label: "Withdrawable",
    render: (stats) => formatCompactDusdc(stats.withdrawable),
    unit: "DUSDC",
  },
  {
    label: "Active markets",
    render: (stats) => stats.activeMarkets.toString(),
  },
]

function StatsBand() {
  const state = useLandingStats()

  return (
    <section>
      <div className="mx-auto max-w-[80rem] px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <Reveal className="max-w-xl">
          <Eyebrow>Live on testnet</Eyebrow>
          <h2 className="mt-4 text-3xl leading-[1.05] font-semibold tracking-tight text-balance text-foreground md:text-5xl">
            Backed by real liquidity.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-pretty text-muted-foreground md:text-lg">
            Vault value, open exposure and active markets — read live from
            DeepBook Predict on Sui testnet.
          </p>
        </Reveal>

        <Reveal className="mt-12" delay={0.12}>
          <dl className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-border/40">
          {statDefs.map((def, index) => (
            <div
              className={cn(
                "px-2 py-8 sm:px-6",
                index === 0 && "md:pl-0",
                index === statDefs.length - 1 && "md:pr-0"
              )}
              key={def.label}
            >
              <dt className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                {def.label}
              </dt>
              <dd className="mt-3 font-mono text-3xl leading-none font-semibold tracking-tight text-foreground tabular-nums md:text-4xl">
                {state.status === "ready" ? (
                  <>
                    {def.render(state.stats)}
                    {def.unit ? (
                      <span className="ml-1.5 text-base font-medium text-muted-foreground">
                        {def.unit}
                      </span>
                    ) : null}
                  </>
                ) : state.status === "error" ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="inline-block h-8 w-24 animate-pulse rounded bg-muted/60 align-middle"
                  />
                )}
              </dd>
            </div>
          ))}
          </dl>
        </Reveal>
      </div>
    </section>
  )
}

function FeatureBlock({
  children,
  copy,
  eyebrow,
  linkLabel,
  reverse = false,
  title,
  to,
}: {
  children: ReactNode
  copy: string
  eyebrow: string
  linkLabel: string
  reverse?: boolean
  title: string
  to: "/markets" | "/strategies" | "/arena"
}) {
  return (
    <section>
      <div className="mx-auto grid max-w-[80rem] items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-32">
        <Reveal className={cn("min-w-0", reverse && "lg:order-2 lg:pl-12")}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-4 text-3xl leading-[1.05] font-semibold tracking-tight text-balance text-foreground md:text-5xl">
            {title}
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-pretty text-muted-foreground md:text-lg">
            {copy}
          </p>
          <Link
            className="group mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/85"
            to={to}
          >
            {linkLabel}
            <ArrowRightIcon className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
        <Reveal
          className={cn("min-w-0", reverse && "lg:order-1")}
          delay={0.12}
        >
          {children}
        </Reveal>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section>
      <div className="mx-auto max-w-[80rem] px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <Reveal className="max-w-xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-4 text-3xl leading-[1.05] font-semibold tracking-tight text-balance text-foreground md:text-5xl">
            Three steps, fully on-chain.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-pretty text-muted-foreground md:text-lg">
            From your first call to final settlement, the whole flow runs
            on-chain.
          </p>
        </Reveal>
        <Reveal
          className="mt-14 grid gap-x-8 gap-y-12 md:grid-cols-3"
          delay={0.12}
        >
          {steps.map((step) => (
            <div key={step.n}>
              <div className="flex items-center gap-4">
                <span className="font-mono text-3xl leading-none font-semibold tracking-tight text-primary tabular-nums">
                  {step.n}
                </span>
                <span
                  aria-hidden="true"
                  className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent"
                />
              </div>
              <h3 className="mt-5 text-base font-medium tracking-tight text-balance text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
                {step.copy}
              </p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  )
}

function Protocol() {
  const points = [
    {
      copy: "Outcomes resolve automatically against a public price oracle — no desk, no discretion.",
      icon: RadioTowerIcon,
      title: "Oracle-settled",
    },
    {
      copy: "You trade straight from your own wallet. CallIt never holds your funds.",
      icon: WalletIcon,
      title: "Non-custodial",
    },
    {
      copy: "Your premium and payout are fixed before you trade. No borrowing, no liquidation.",
      icon: ShieldCheckIcon,
      title: "Fixed terms",
    },
  ]

  return (
    <section>
      <div className="mx-auto grid max-w-[80rem] gap-10 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-32">
        <Reveal>
          <Eyebrow>Backed by the protocol</Eyebrow>
          <h2 className="mt-4 text-2xl leading-[1.1] font-semibold tracking-tight text-balance text-foreground md:text-4xl">
            Settled on DeepBook Predict.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-pretty text-muted-foreground">
            CallIt is the consumer hub for DeepBook Predict on Sui — one place to
            trade, follow, provide liquidity, or keep the market running. Markets,
            premiums and settlement all live on-chain, so every outcome is
            transparent and can't be quietly changed.
          </p>
        </Reveal>
        <Reveal className="space-y-6" delay={0.12}>
          {points.map((point) => (
            <div className="flex gap-4" key={point.title}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <point.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {point.title}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-pretty text-muted-foreground">
                  {point.copy}
                </p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  )
}

function CtaBand() {
  return (
    <section className="relative overflow-hidden px-4 py-24 text-center sm:px-6 lg:px-8 lg:py-32">
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[32rem] w-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.05] blur-[140px]" />
      <Reveal className="relative mx-auto max-w-2xl">
        <h2 className="text-3xl leading-[1.02] font-semibold tracking-tight text-balance text-foreground md:text-5xl">
          Make your first call.
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-pretty text-muted-foreground">
          Open the app and call your first market on testnet.
        </p>
        <div className="mt-9 flex justify-center">
          <PrimaryCta>Open app</PrimaryCta>
        </div>
      </Reveal>
    </section>
  )
}

export function Page() {
  return (
    <main className="min-w-0">
      <Hero />
      <SectionDivider />
      <StatsBand />
      <SectionDivider />

      <FeatureBlock
        copy="Live BTC markets — call the next close as a simple Yes/No, or in Pro with Up/Down, strikes and expiries. Your premium and payout are set before you confirm."
        eyebrow="Trade"
        linkLabel="Open the markets"
        title="Pick a market. Take a side."
        to="/markets"
      >
        <TradeTicketMock />
      </FeatureBlock>
      <SectionDivider />

      <FeatureBlock
        copy="Don't want to call every market yourself? Put DUSDC to work in vault strategies — from plain liquidity to a hedged note."
        eyebrow="Earn"
        linkLabel="Explore strategies"
        reverse
        title="Or put your capital to work."
        to="/strategies"
      >
        <StrategyOverviewMock />
      </FeatureBlock>
      <SectionDivider />

      <FeatureBlock
        copy="In the Arena, creators bond capital and call the market in the open. Follow their track record, then back the calls you believe in — or fade the ones you don't."
        eyebrow="Arena"
        linkLabel="Enter the Arena"
        title="Back the sharpest callers."
        to="/arena"
      >
        <ArenaCallMock />
      </FeatureBlock>
      <SectionDivider />

      <HowItWorks />
      <SectionDivider />
      <Protocol />
      <SectionDivider />
      <CtaBand />
      <ScrollCue />
    </main>
  )
}
