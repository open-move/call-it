import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { formatRelativeTime } from "~/lib/callit/format"
import { type ProTrade } from "~/lib/callit/pro/types"
import { cn } from "~/lib/utils"

export interface TradesProps {
  trades: ProTrade[]
}

function formatPriceCents(price: number) {
  return `${(price * 100).toFixed(1)}¢`
}

function formatQuantity(quantity: number) {
  return quantity.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })
}

function formatCostUsd(costUsd: number) {
  return costUsd.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  })
}

export function Trades({ trades }: TradesProps) {
  return (
    <Card className="flex h-full w-full rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm font-semibold">Trades</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto px-0 pb-2">
        {trades.length > 0 ? (
          <div className="divide-y divide-border/35">
            <div className="grid grid-cols-[3.5rem_3.5rem_3.75rem_1fr] gap-2 px-4 pb-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              <span>Time</span>
              <span>Side</span>
              <span>Price</span>
              <span className="text-right">Size</span>
            </div>
            {trades.slice(0, 12).map((trade) => (
              <div
                className="grid grid-cols-[3.5rem_3.5rem_3.75rem_1fr] gap-2 px-4 py-2 text-xs"
                key={trade.id}
              >
                <span className="truncate font-mono text-muted-foreground tabular-nums">
                  {formatRelativeTime(trade.timestampMs)}
                </span>
                <span
                  className={cn(
                    "font-medium capitalize",
                    trade.side === "above"
                      ? "text-outcome-up"
                      : "text-outcome-down"
                  )}
                >
                  {trade.side}
                </span>
                <span className="font-mono text-foreground tabular-nums">
                  {formatPriceCents(trade.price)}
                </span>
                <span className="truncate text-right font-mono text-muted-foreground tabular-nums">
                  {formatQuantity(trade.quantity)} ·{" "}
                  {formatCostUsd(trade.costUsd)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-64 items-center justify-center px-4 pb-4 text-center text-xs leading-5 text-muted-foreground">
            No trades for this contract yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
