import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import {
  formatBps,
  formatDusdc,
  formatShares,
  sharePriceFormatter,
} from "@/lib/shield/format"
import type { HedgedPlpStrategyState } from "@/services/shield-client"

function VaultOverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs leading-none text-muted-foreground">
        {label}
      </span>
      <div className="truncate text-right font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function AllocationItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] leading-none text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function CapitalStack({ strategy }: { strategy?: HedgedPlpStrategyState }) {
  const plpAllocation = strategy?.policy.maxPlpAllocationBps ?? 0
  const hedgeBudget = strategy?.policy.hedgeBudgetBps ?? 0
  const reserve = strategy?.policy.reserveBps ?? 0

  return (
    <div className="mt-4 rounded-md border border-border/35 bg-muted/25 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground">
          Capital stack
        </span>
        <span className="font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
          Policy caps
        </span>
      </div>
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-background/80">
        <div
          className="bg-primary"
          style={{ width: `${Math.max(0, plpAllocation) / 100}%` }}
        />
        <div
          className="bg-primary/45"
          style={{ width: `${Math.max(0, hedgeBudget) / 100}%` }}
        />
        <div
          className="bg-muted-foreground/35"
          style={{ width: `${Math.max(0, reserve) / 100}%` }}
        />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <AllocationItem
          label="PLP cap"
          value={
            strategy ? formatBps(strategy.policy.maxPlpAllocationBps) : "--"
          }
        />
        <AllocationItem
          label="Hedge budget"
          value={strategy ? formatBps(strategy.policy.hedgeBudgetBps) : "--"}
        />
        <AllocationItem
          label="Reserve"
          value={strategy ? formatBps(strategy.policy.reserveBps) : "--"}
        />
      </div>
    </div>
  )
}

export function ShieldOverviewCard({
  isLoading,
  status,
  strategy,
}: {
  isLoading: boolean
  status: string
  strategy?: HedgedPlpStrategyState
}) {
  return (
    <Card className="h-full gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Strategy Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-4 pt-2 pb-4">
        <div className="space-y-2.5">
          <VaultOverviewRow
            label="Strategy NAV"
            value={
              strategy ? formatDusdc(strategy.nav) : isLoading ? "--" : "Setup"
            }
          />
          <VaultOverviewRow
            label="Cash reserve"
            value={strategy ? formatDusdc(strategy.cash) : "--"}
          />
          <VaultOverviewRow
            label="PLP deployed"
            value={strategy ? formatDusdc(strategy.plpCostBasis) : "--"}
          />
          <VaultOverviewRow
            label="PLP balance"
            value={
              strategy
                ? formatDecimalUnits(
                    strategy.plpAmount,
                    PREDICT_QUOTE_DECIMALS,
                    4
                  )
                : "--"
            }
          />
          <VaultOverviewRow
            label="hPLP Supply"
            value={strategy ? formatShares(strategy.shareSupply) : "--"}
          />
          <VaultOverviewRow
            label="hPLP Price"
            value={
              strategy
                ? `${sharePriceFormatter.format(strategy.sharePrice)} DUSDC`
                : "--"
            }
          />
          <VaultOverviewRow label="Status" value={status} />
        </div>

        <CapitalStack strategy={strategy} />
      </CardContent>
    </Card>
  )
}
