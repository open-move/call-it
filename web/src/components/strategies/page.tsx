import { Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"

import { Badge, BadgeTone } from "@/components/primitives/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

enum StrategyVisual {
  Liquidity = "liquidity",
  TailHedge = "tailHedge",
  RangeLadder = "rangeLadder",
}

interface StrategyTerm {
  label: string
  value: string
}

interface StrategyCardData {
  description: string
  href: "/earn" | "/shield" | "/range-ladder"
  label: string
  status: string
  terms: StrategyTerm[]
  title: string
  tone: BadgeTone
  visual: StrategyVisual
}

const strategyCards: StrategyCardData[] = [
  {
    description:
      "Supply DUSDC to back Predict market liquidity and receive PLP shares.",
    href: "/earn",
    label: "Liquidity",
    status: "Live",
    terms: [
      { label: "Share", value: "PLP" },
      { label: "Exposure", value: "Market depth" },
      { label: "Accounting", value: "DUSDC" },
    ],
    title: "Base PLP",
    tone: BadgeTone.Live,
    visual: StrategyVisual.Liquidity,
  },
  {
    description:
      "Allocate PLP capital with a downside hedge budget and round-based realization.",
    href: "/shield",
    label: "Hedged",
    status: "Live",
    terms: [
      { label: "Share", value: "hPLP" },
      { label: "Exposure", value: "PLP + DOWN" },
      { label: "Accounting", value: "DUSDC" },
    ],
    title: "Tail Hedge PLP",
    tone: BadgeTone.Live,
    visual: StrategyVisual.TailHedge,
  },
  {
    description:
      "Deploy native Predict range positions across selected rungs for calm-market exposure.",
    href: "/range-ladder",
    label: "Range",
    status: "Live",
    terms: [
      { label: "Share", value: "rLADDER" },
      { label: "Exposure", value: "Range rungs" },
      { label: "Accounting", value: "DUSDC" },
    ],
    title: "Range Ladder",
    tone: BadgeTone.Live,
    visual: StrategyVisual.RangeLadder,
  },
]

function PanelGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--border)_38%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--border)_30%,transparent)_1px,transparent_1px)] bg-[size:2rem_2rem] opacity-35" />
  )
}

function StrategyTermRow({ label, value }: StrategyTerm) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/25 py-2 last:border-b-0">
      <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate text-right font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}

function LiquidityVisual() {
  return (
    <div className="relative h-36 overflow-hidden rounded-md border border-border/35 bg-background/45 p-3">
      <PanelGrid />
      <div className="relative flex h-full flex-col justify-end gap-2">
        <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span>DUSDC in</span>
          <span>PLP out</span>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-[92%] rounded-sm bg-outcome-up/70 transition-[opacity,width] duration-200 group-hover:w-[96%] group-hover:opacity-100" />
          <div className="h-3 w-[78%] rounded-sm bg-primary/65 transition-[width] duration-200 group-hover:w-[84%]" />
          <div className="h-3 w-[58%] rounded-sm bg-muted-foreground/35 transition-[width] duration-200 group-hover:w-[64%]" />
        </div>
        <div className="mt-1 flex items-center gap-2 rounded-md border border-border/30 bg-card/70 px-2 py-1.5">
          <div className="size-1.5 rounded-full bg-outcome-up" />
          <span className="font-mono text-[10px] text-muted-foreground uppercase">
            Liquidity depth stack
          </span>
        </div>
      </div>
    </div>
  )
}

function TailHedgeVisual() {
  return (
    <div className="relative h-36 overflow-hidden rounded-md border border-border/35 bg-background/45 p-3">
      <PanelGrid />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span>PLP capital</span>
          <span>Tail hedge</span>
        </div>
        <div className="relative rounded-md border border-border/30 bg-card/70 p-3">
          <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-muted/45">
            <div className="w-[64%] bg-primary transition-[width] duration-200 group-hover:w-[68%]" />
            <div className="w-[18%] bg-warning/75" />
            <div className="w-[18%] bg-muted-foreground/35" />
          </div>
          <div className="relative h-14 rounded-sm border border-border/25 bg-muted/15">
            <div className="absolute top-1/2 left-[58%] h-[calc(100%+0.75rem)] w-px -translate-y-1/2 bg-primary/70" />
            <div className="absolute top-1/2 left-[26%] h-[calc(100%+0.75rem)] w-px -translate-y-1/2 bg-outcome-down" />
            <div className="absolute right-[12%] bottom-2 left-[26%] h-3 rounded-sm bg-outcome-down/18 ring-1 ring-outcome-down/25" />
            <div className="absolute top-2 left-[58%] font-mono text-[10px] text-primary uppercase">
              Spot
            </div>
            <div className="absolute bottom-2 left-[6%] font-mono text-[10px] text-outcome-down uppercase">
              Down tail
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RangeLadderVisual() {
  return (
    <div className="relative h-36 overflow-hidden rounded-md border border-border/35 bg-background/45 p-3">
      <PanelGrid />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span>Lower</span>
          <span>Higher</span>
        </div>
        <div className="space-y-2 rounded-md border border-border/30 bg-card/70 p-3">
          <div className="ml-[6%] h-4 w-[52%] rounded-sm bg-chart-2/70 transition-[margin,width] duration-200 group-hover:ml-[4%] group-hover:w-[56%]" />
          <div className="ml-[20%] h-4 w-[48%] rounded-sm bg-primary/70 transition-[margin,width] duration-200 group-hover:ml-[18%] group-hover:w-[52%]" />
          <div className="ml-[36%] h-4 w-[42%] rounded-sm bg-chart-3/65 transition-[margin,width] duration-200 group-hover:ml-[34%] group-hover:w-[46%]" />
        </div>
        <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground uppercase">
          <span>Three rungs</span>
          <span>Range mode</span>
        </div>
      </div>
    </div>
  )
}

function StrategyVisualPanel({ visual }: { visual: StrategyVisual }) {
  switch (visual) {
    case StrategyVisual.Liquidity:
      return <LiquidityVisual />
    case StrategyVisual.TailHedge:
      return <TailHedgeVisual />
    case StrategyVisual.RangeLadder:
      return <RangeLadderVisual />
  }
}

function StrategyCard({ strategy }: { strategy: StrategyCardData }) {
  return (
    <Card className="group h-full gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <Badge className="px-2 py-0.5 text-[10px]" tone={strategy.tone}>
                {strategy.status}
              </Badge>
              <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                {strategy.label}
              </span>
            </div>
            <CardTitle className="text-xl leading-none font-semibold tracking-[-0.04em] text-balance text-foreground">
              {strategy.title}
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-4 pt-1 pb-4">
        <StrategyVisualPanel visual={strategy.visual} />
        <p className="mt-4 max-w-sm text-sm leading-6 text-pretty text-muted-foreground">
          {strategy.description}
        </p>
        <div className="mt-4 rounded-md border border-border/30 bg-muted/15 px-3 py-1">
          {strategy.terms.map((term) => (
            <StrategyTermRow
              key={term.label}
              label={term.label}
              value={term.value}
            />
          ))}
        </div>
        <Button
          className="mt-4 w-full justify-between transition-[background-color,transform] active:scale-[0.96]"
          render={<Link to={strategy.href} />}
          type="button"
        >
          Open strategy
          <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Button>
      </CardContent>
    </Card>
  )
}

export function Page() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl space-y-3">
        <div className="rounded-md bg-card px-4 py-4">
          <div className="font-mono text-[10px] tracking-[0.18em] text-primary uppercase">
            Strategies
          </div>
          <h1 className="mt-2 max-w-2xl text-3xl leading-none font-semibold tracking-[-0.055em] text-balance text-foreground sm:text-4xl">
            Select how capital works in Predict markets.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">
            Choose direct PLP liquidity, hedged PLP exposure, or native range
            laddering. Values are accounted in DUSDC where applicable.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {strategyCards.map((strategy) => (
            <StrategyCard key={strategy.title} strategy={strategy} />
          ))}
        </div>
      </section>
    </main>
  )
}
