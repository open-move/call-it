import { AllocationBar } from "@/components/primitives/allocation-bar"
import type { AllocationSegment } from "@/components/primitives/allocation-bar"
import { DataRow } from "@/components/primitives/data-row"
import { formatDusdc, formatShares, sharePriceFormatter } from "@/lib/shield/format"
import type { HedgedPlpStrategyState } from "@/services/shield-client"

function allocationSegments(
  strategy?: HedgedPlpStrategyState
): AllocationSegment[] | undefined {
  if (!strategy) {
    return undefined
  }

  const plp = strategy.policy.maxPlpAllocationBps
  const hedge = strategy.policy.hedgeBudgetBps
  const reserve = strategy.policy.reserveBps
  const total = plp + hedge + reserve

  if (total <= 0) {
    return undefined
  }

  return [
    { label: "PLP", pct: plp / total, tone: "primary" },
    { label: "Hedge", pct: hedge / total, tone: "down" },
    { label: "Reserve", pct: reserve / total, tone: "muted" },
  ]
}

function HeroNumber({
  isLoading,
  value,
}: {
  isLoading: boolean
  value?: string
}) {
  if (value !== undefined) {
    return (
      <div className="mt-1 font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
        {value}
      </div>
    )
  }

  return (
    <div className="mt-1">
      {isLoading ? (
        <span
          aria-hidden="true"
          className="inline-block h-5 w-20 animate-pulse rounded bg-muted align-middle"
        />
      ) : (
        <span className="font-mono text-xl leading-none font-medium text-foreground">
          —
        </span>
      )}
    </div>
  )
}

export function ShieldOverviewCard({
  isLoading,
  strategy,
}: {
  isLoading: boolean
  status: string
  strategy?: HedgedPlpStrategyState
}) {
  const segments = allocationSegments(strategy)

  return (
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
        Strategy
      </h2>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            NAV
          </div>
          <HeroNumber
            isLoading={isLoading}
            value={strategy ? formatDusdc(strategy.nav) : undefined}
          />
        </div>
        <div className="min-w-0 text-right">
          <div className="text-xs text-muted-foreground">
            hPLP price
          </div>
          <HeroNumber
            isLoading={isLoading}
            value={
              strategy
                ? sharePriceFormatter.format(strategy.sharePrice)
                : undefined
            }
          />
        </div>
      </div>

      <div className="mt-5">
        <AllocationBar label="Capital allocation" segments={segments} />
      </div>

      <div className="mt-5">
        <DataRow
          label="Cash reserve"
          value={strategy ? formatDusdc(strategy.cash) : "—"}
        />
        <DataRow
          label="PLP deployed"
          value={strategy ? formatDusdc(strategy.plpCostBasis) : "—"}
        />
        <DataRow
          label="hPLP supply"
          value={strategy ? formatShares(strategy.shareSupply) : "—"}
        />
      </div>
    </div>
  )
}
