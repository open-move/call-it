import { Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"

import { StatusIndicator } from "@/components/primitives/status-indicator"
import { Card } from "@/components/ui/card"
import { StrategyVisual } from "./strategy-visual"
import { performanceMetric } from "@/lib/perf/annualize"
import {
  getStrategyStatusTone,
  useStrategyStats,
} from "@/lib/strategies/hooks"
import type { StrategyStat, StrategyStatsKey } from "@/lib/strategies/hooks"
import { STRATEGY_ORDER, getStrategyMeta } from "@/lib/strategies/registry"

interface StrategyCardData {
  description: string
  /** Strategy-detail slug (`/strategies/<slug>`). Absent for the PLP Earn card, which links to `/earn`. */
  slug?: string
  key: StrategyStatsKey
  /** Underlying market shown as a chip. Absent for the PLP pool (no single asset). */
  asset?: string
  shareToken: string
  status: string
  title: string
}

// The PLP Earn vault is bespoke (links to /earn); the strategy vaults are
// generated from the registry so every strategy surfaces here automatically.
const earnCard: StrategyCardData = {
  description:
    "Supply DUSDC to back Predict market liquidity and receive PLP shares.",
  key: "earn",
  shareToken: "PLP",
  status: "Live",
  title: "PLP Earn",
}

const strategyCards: StrategyCardData[] = [
  earnCard,
  ...STRATEGY_ORDER.map((key): StrategyCardData => {
    const meta = getStrategyMeta(key)
    return {
      description: meta.tagline,
      slug: meta.key,
      key,
      asset: meta.asset,
      shareToken: "Shares",
      status: "Live",
      title: meta.name,
    }
  }),
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

function StrategyCard({
  stat,
  strategy,
}: {
  stat?: StrategyStat
  strategy: StrategyCardData
}) {
  const status = stat?.status ?? strategy.status

  return (
    <Card className="group flex h-full flex-col gap-0 overflow-hidden rounded-lg border-0 bg-card p-0 shadow-none ring-0 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <StrategyVisual strategyKey={strategy.key} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2">
          {strategy.asset ? (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground">
              {strategy.asset}
            </span>
          ) : null}
          <StatusIndicator className="text-xs" tone={getStrategyStatusTone(status)}>
            {status}
          </StatusIndicator>
        </div>

        <h2 className="mt-2.5 text-sm leading-none font-medium tracking-[-0.01em] text-balance text-foreground">
          {strategy.title}
        </h2>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-pretty text-muted-foreground">
          {strategy.description}
        </p>

        <div className="mt-9 grid grid-cols-3 items-end gap-3">
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
          <div className="min-w-0 text-center">
            <div className="truncate text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              {performanceMetric(stat?.apyMetric).label}
            </div>
            <div className="mt-1 truncate font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
              {stat ? (
                performanceMetric(stat.apyMetric).value
              ) : (
                <SkeletonBar className="h-5 w-14" />
              )}
            </div>
          </div>
          <div className="min-w-0 text-right">
            <div className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              {strategy.asset ? "Share" : strategy.shareToken} price
            </div>
            <div className="mt-1 font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
              {stat ? (
                stat.sharePrice === undefined ? (
                  "—"
                ) : (
                  `$${sharePriceFormatter.format(stat.sharePrice)}`
                )
              ) : (
                <SkeletonBar className="h-5 w-16" />
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-4">
          {strategy.slug ? (
            <Link
              className="flex items-center justify-between border-t border-border/30 pt-3 text-sm font-medium text-foreground transition-colors group-hover:text-primary"
              params={{ strategyId: strategy.slug }}
              to="/strategies/$strategyId"
            >
              Open strategy
              <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <Link
              className="flex items-center justify-between border-t border-border/30 pt-3 text-sm font-medium text-foreground transition-colors group-hover:text-primary"
              to="/earn"
            >
              Open strategy
              <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          )}
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
          <h1 className="text-xl font-semibold tracking-tight text-balance text-foreground">
            Strategies
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">
            Hands-off option-strategy vaults (hedged PLP, collars, strangles,
            ladders) that settle each round on-chain, or provide PLP liquidity
            directly.
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
