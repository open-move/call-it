import { type TradeMarket } from "~/lib/callit/trade/types"
import { cn } from "~/lib/utils"

import { Row } from "./row"

export interface TableProps {
  markets: TradeMarket[]
}

const columns = [
  { id: "market", label: "Market" },
  { id: "chart", label: "" },
  { id: "price", label: "Price (Up)" },
  { id: "volume", label: "Volume" },
  { id: "distance", label: "Distance" },
  { id: "expires", label: "Expires" },
  { id: "action", label: "" },
]

export function Table({ markets }: TableProps) {
  return (
    <div className="overflow-hidden rounded-md bg-card py-0 shadow-none ring-0">
      <div className="hidden border-b border-border/40 bg-card px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:grid lg:grid-cols-[minmax(15rem,1.5fr)_7rem_0.6fr_0.7fr_0.75fr_0.75fr_7rem] lg:items-center">
        {columns.map((column, index) => (
          <div
            className={cn(
              index > 0 && "border-l border-border/25 pl-3",
              index > 1 && "text-right"
            )}
            key={column.id}
          >
            {column.label}
          </div>
        ))}
      </div>
      <div className="max-h-[calc(100vh-19rem)] overflow-y-auto overscroll-contain lg:max-h-[calc(100vh-18rem)]">
        {markets.length > 0 ? (
          markets.map((market) => <Row key={market.id} market={market} />)
        ) : (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No markets match these filters.
          </div>
        )}
      </div>
    </div>
  )
}
