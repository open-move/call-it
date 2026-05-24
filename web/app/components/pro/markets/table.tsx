import { type ReactNode } from "react"

import { type ProMarket } from "~/lib/callit/pro/types"
import { formatUsd } from "~/lib/callit/format"
import { cn } from "~/lib/utils"

import { Row } from "./row"

export interface TableProps {
  markets: ProMarket[]
  toolbar?: ReactNode
}

const columnLabels = [
  "Market",
  "Spot",
  "Strike",
  "Distance",
  "Expiry",
  "Updated",
]

const expiryTimeFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
})

interface MarketGroup {
  groupKey: string
  markets: ProMarket[]
}

function formatExpiryTime(expiryMs: number) {
  return expiryTimeFormatter.format(new Date(expiryMs))
}

function groupMarketsByExpiry(markets: ProMarket[]): MarketGroup[] {
  return markets.reduce<MarketGroup[]>((groups, market) => {
    const groupKey = `${market.oracleId}:${market.expiryMs}`
    const existingGroup = groups.find((group) => group.groupKey === groupKey)

    if (existingGroup) {
      existingGroup.markets.push(market)
      return groups
    }

    return [...groups, { groupKey, markets: [market] }]
  }, [])
}

export function Table({ markets, toolbar }: TableProps) {
  const marketGroups = groupMarketsByExpiry(markets)

  return (
    <div className="overflow-hidden rounded-md border border-border/50 bg-background/30">
      {toolbar}
      <div className="hidden border-b border-border/60 bg-background/70 px-4 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:grid lg:grid-cols-[minmax(15rem,1.45fr)_0.8fr_0.8fr_0.95fr_0.9fr_0.75fr]">
        {columnLabels.map((label, index) => (
          <div
            className={cn(
              index > 0 && "border-l border-border/20 pl-4",
              index > 0 && "text-right"
            )}
            key={label}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="max-h-[calc(100vh-15rem)] overflow-y-auto overscroll-contain">
        {marketGroups.map((group) => (
          <div key={group.groupKey}>
            <GroupHeader markets={group.markets} />
            {group.markets.map((market) => (
              <Row key={market.id} market={market} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function GroupHeader({ markets }: { markets: ProMarket[] }) {
  const [market] = markets

  if (!market) {
    return null
  }

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/35 bg-surface/95 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase sm:px-4">
      <span>
        {market.assetSymbol} · {formatExpiryTime(market.expiryMs)} ·{" "}
        {markets.length} strikes
      </span>
      <span className="tabular-nums">
        Spot {formatUsd(market.currentPriceUsd, 0)}
      </span>
    </div>
  )
}
