import { Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"

import { StatusIndicator } from "@/components/primitives/status-indicator"
import { Card } from "@/components/ui/card"
import { StrategyVisual } from "./strategy-visual"
import {
  getStrategyStatusTone,
  useStrategyStats,
} from "@/lib/strategies/hooks"
import type {
  AllocationSegment,
  AllocationTone,
  StrategyKey,
  StrategyStat,
} from "@/lib/strategies/hooks"

interface StrategyCardData {
  description: string
  href: "/earn" | "/shield" | "/range-ladder"
  key: StrategyKey
  shareToken: string
  status: string
  title: string
}

const strategyCards: StrategyCardData[] = [
  {
    description:
      "Supply DUSDC to back Predict market liquidity and receive PLP shares.",
    href: "/earn",
    key: "earn",
    shareToken: "PLP",
    status: "Live",
    title: "Base PLP",
  },
  {
    description:
      "Allocate PLP capital with a downside hedge budget and round-based realization.",
    href: "/shield",
    key: "shield",
    shareToken: "hPLP",
    status: "Live",
    title: "Tail Hedge PLP",
  },
  {
    description:
      "Deploy native Predict range positions across selected rungs for calm-market exposure.",
    href: "/range-ladder",
    key: "rangeLadder",
    shareToken: "rLADDER",
    status: "Live",
    title: "Range Ladder",
  },
]

const sharePriceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 4,
})

const navFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
})

function SkeletonBar({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-pulse rounded bg-muted align-middle ${className}`}
    />
  )
}

const allocationToneClassName: Record<AllocationTone, string> = {
  primary: "bg-primary",
  down: "bg-outcome-down",
  muted: "bg-muted-foreground/40",
}

const allocationDotClassName: Record<AllocationTone, string> = {
  primary: "bg-primary",
  down: "bg-outcome-down",
  muted: "bg-muted-foreground/55",
}

function AllocationViz({
  label,
  segments,
}: {
  label: string
  segments?: AllocationSegment[]
}) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-2 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
        {segments ? (
          segments.map((segment) => (
            <div
              className={`h-full ${allocationToneClassName[segment.tone]} transition-[width] duration-500 ease-out`}
              key={segment.label}
              style={{ width: `${Math.round(segment.pct * 100)}%` }}
            />
          ))
        ) : (
          <div className="h-full w-full animate-pulse bg-muted/60" />
        )}
      </div>
      {segments ? (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((segment) => (
            <div className="flex items-center gap-1.5" key={segment.label}>
              <span
                className={`size-1.5 rounded-full ${allocationDotClassName[segment.tone]}`}
              />
              <span className="text-[10px] text-muted-foreground">
                {segment.label}
              </span>
              <span className="font-mono text-[10px] font-medium text-foreground tabular-nums">
                {Math.round(segment.pct * 100)}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2.5 h-3 w-32 animate-pulse rounded bg-muted/50" />
      )}
    </div>
  )
}

function StrategyCard({
  stat,
  strategy,
}: {
  stat?: StrategyStat
  strategy: StrategyCardData
}) {
  const status = stat?.status ?? strategy.status
  const allocationLabel =
    strategy.key === "earn" ? "Utilization" : "Capital allocation"

  return (
    <Card className="group flex h-full flex-col gap-0 overflow-hidden rounded-lg border-0 bg-card p-0 shadow-none ring-0 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <StrategyVisual strategyKey={strategy.key} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-3">
          <StatusIndicator
            className="text-xs"
            tone={getStrategyStatusTone(status)}
          >
            {status}
          </StatusIndicator>
          <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.08em] text-primary">
            {strategy.shareToken}
          </span>
        </div>

        <h2 className="mt-2.5 text-sm leading-none font-medium tracking-[-0.01em] text-balance text-foreground">
          {strategy.title}
        </h2>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-pretty text-muted-foreground">
          {strategy.description}
        </p>

        <div className="mt-9 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              NAV
            </div>
            <div className="mt-1 font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
              {stat ? (
                stat.navUsd === undefined ? (
                  "—"
                ) : (
                  navFormatter.format(stat.navUsd)
                )
              ) : (
                <SkeletonBar className="h-5 w-24" />
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              {strategy.shareToken} price
            </div>
            <div className="mt-1 font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
              {stat ? (
                stat.sharePrice === undefined ? (
                  "—"
                ) : (
                  sharePriceFormatter.format(stat.sharePrice)
                )
              ) : (
                <SkeletonBar className="h-5 w-16" />
              )}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <AllocationViz label={allocationLabel} segments={stat?.segments} />
        </div>

        <div className="mt-auto pt-4">
          <Link
            className="flex items-center justify-between border-t border-border/30 pt-3 text-sm font-medium text-foreground transition-colors group-hover:text-primary"
            to={strategy.href}
          >
            Open strategy
            <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </Card>
  )
}

export function Page() {
  const stats = useStrategyStats()

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl space-y-3">
        <div className="px-1 pt-1 pb-2">
          <h1 className="font-mono text-[10px] tracking-[0.18em] text-primary uppercase">
            Strategies
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">
            Choose direct PLP liquidity, hedged PLP exposure, or native range
            laddering. Values are accounted in DUSDC where applicable.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {strategyCards.map((strategy) => (
            <StrategyCard
              key={strategy.key}
              stat={stats?.[strategy.key]}
              strategy={strategy}
            />
          ))}
        </div>
      </section>
    </main>
  )
}
