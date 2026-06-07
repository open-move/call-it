import { type ReactNode } from "react"

import { formatUsd } from "@/lib/callit/format"
import { type MarketSnapshot } from "@/lib/callit/market/types"

import { formatExpiry, formatStatus, formatUpdated } from "./utils"

export interface SpecsProps {
  market: MarketSnapshot
  selectedStrikePriceUsd: number
}

export function Specs({ market, selectedStrikePriceUsd }: SpecsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SpecPanel title="Contract Specs">
        <SpecRow label="Asset" value={market.assetSymbol} />
        <SpecRow label="Spot" value={formatUsd(market.currentPriceUsd, 0)} />
        <SpecRow label="Strike" value={formatUsd(selectedStrikePriceUsd, 0)} />
        <SpecRow label="Tick size" value={formatUsd(market.tickSizeUsd, 2)} />
        <SpecRow label="Min strike" value={formatUsd(market.minStrikeUsd, 0)} />
      </SpecPanel>
      <SpecPanel title="Oracle & Settlement">
        <SpecRow label="Oracle" value={market.oracleId} />
        <SpecRow label="Expiry" value={formatExpiry(market.expiryMs)} />
        <SpecRow label="Updated" value={formatUpdated(market.priceUpdatedMs)} />
        <SpecRow label="Status" value={formatStatus(market.status)} />
      </SpecPanel>
    </div>
  )
}

function SpecPanel({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section className="rounded-md border border-border/50 bg-background/35 p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/30 py-2 text-sm last:border-b-0">
      <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="max-w-[70%] truncate text-right font-mono text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}
