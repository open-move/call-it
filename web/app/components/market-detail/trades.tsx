import { ActivityIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { formatUsd } from "~/lib/callit/format"
import { type TradeActivityRow } from "~/lib/callit/trade/types"
import { cn } from "~/lib/utils"

export interface TradesProps {
  trades: TradeActivityRow[]
}

function formatPriceCents(price: number) {
  return `${(price * 100).toFixed(1)}¢`
}

function formatQuantity(quantity: number) {
  return quantity.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })
}

function formatTradeTime(timestampMs: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  }).format(timestampMs)
}

function getSideLabel(side: "above" | "below") {
  return side === "above" ? "Up" : "Down"
}

function getTradeContract(trade: TradeActivityRow) {
  return trade.kind === "directional"
    ? `${formatUsd(trade.strikePriceUsd, 0)} ${getSideLabel(trade.side)}`
    : `${formatUsd(trade.lowerStrikePriceUsd, 0)}-${formatUsd(trade.higherStrikePriceUsd, 0)} Range`
}

export function Trades({ trades }: TradesProps) {
  return (
    <Card className="flex h-full w-full flex-col rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-3 py-2.5">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          <ActivityIcon className="size-3.5 text-muted-foreground" />
          Trades
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto px-0 pb-2.5">
        {trades.length > 0 ? (
          <div className="space-y-1 px-3">
            <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_4.75rem] gap-3 px-2 pb-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              <span>Contract</span>
              <span className="text-right">Size</span>
              <span className="text-right">Time</span>
            </div>
            {trades.map((trade) => (
              <div
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_4.25rem_4.75rem] gap-3 rounded-sm px-2 py-1.5 text-xs tabular-nums",
                  trade.kind === "range"
                    ? "bg-primary/10"
                    : trade.side === "above"
                      ? "bg-outcome-up/10"
                      : "bg-outcome-down/10"
                )}
                key={trade.id}
              >
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate font-medium",
                      trade.kind === "range"
                        ? "text-primary"
                        : trade.side === "above"
                          ? "text-outcome-up"
                          : "text-outcome-down"
                    )}
                  >
                    {getTradeContract(trade)}
                  </span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {formatPriceCents(trade.price)}
                  </span>
                </span>
                <span className="truncate text-right font-mono text-foreground">
                  {formatQuantity(trade.quantity)}
                </span>
                <span className="text-right font-mono text-foreground">
                  {formatTradeTime(trade.timestampMs)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-64 items-center justify-center px-4 pb-4 text-center text-xs leading-5 text-muted-foreground">
            No trades for this market yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
