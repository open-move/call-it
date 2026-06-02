import { ActivityIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { type Trade } from "~/lib/callit/trade/types"
import { cn } from "~/lib/utils"

export interface TradesProps {
  trades: Trade[]
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
            <div className="grid grid-cols-[1fr_1fr_4.75rem] gap-3 px-2 pb-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              <span>Price</span>
              <span className="text-right">Size</span>
              <span className="text-right">Time</span>
            </div>
            {trades.map((trade) => (
              <div
                className={cn(
                  "grid grid-cols-[1fr_1fr_4.75rem] gap-3 rounded-sm px-2 py-1 text-xs tabular-nums",
                  trade.side === "above"
                    ? "bg-outcome-up/10"
                    : "bg-outcome-down/10"
                )}
                key={trade.id}
              >
                <span
                  className={cn(
                    "font-mono font-medium",
                    trade.side === "above"
                      ? "text-outcome-up"
                      : "text-outcome-down"
                  )}
                >
                  {formatPriceCents(trade.price)}
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
