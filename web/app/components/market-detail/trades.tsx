import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import {
  type RedemptionActivityRow,
  type TradeActivityRow,
} from "~/lib/callit/trade/types"
import { cn } from "~/lib/utils"

export interface TradesProps {
  redemptions: RedemptionActivityRow[]
  trades: TradeActivityRow[]
}

type TapeRow =
  | ({ action: "mint" } & TradeActivityRow)
  | ({ action: "sell" } & RedemptionActivityRow)

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

function getTapePrice(row: TapeRow) {
  return row.action === "mint" ? row.price : row.bidPrice
}

function getTapeRows(
  trades: TradeActivityRow[],
  redemptions: RedemptionActivityRow[]
) {
  return [
    ...trades.map((trade) => ({ ...trade, action: "mint" as const })),
    ...redemptions.map((redemption) => ({
      ...redemption,
      action: "sell" as const,
    })),
  ].sort(
    (firstRow, secondRow) =>
      secondRow.timestampMs - firstRow.timestampMs ||
      firstRow.id.localeCompare(secondRow.id)
  )
}

export function Trades({ redemptions, trades }: TradesProps) {
  const tapeRows = getTapeRows(trades, redemptions)

  return (
    <Card className="flex h-full w-full flex-col rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-3 py-2.5">
        <CardTitle className="text-sm font-medium">Trades</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto px-0 pb-2.5">
        {tapeRows.length > 0 ? (
          <div className="space-y-1 px-2">
            <div className="grid grid-cols-[minmax(0,1fr)_3rem_4.75rem] gap-2 px-2 pb-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase sm:grid-cols-[minmax(0,1fr)_3.25rem_4.75rem]">
              <span>Price</span>
              <span className="text-center">Size</span>
              <span className="text-right">Time</span>
            </div>
            {tapeRows.map((row) => (
              <div
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_3rem_4.75rem] items-center gap-2 rounded-sm px-2 py-1.5 text-xs tabular-nums sm:grid-cols-[minmax(0,1fr)_3.25rem_4.75rem]",
                  row.action === "mint"
                    ? "bg-outcome-up/10"
                    : "bg-outcome-down/10"
                )}
                key={`${row.action}:${row.id}`}
              >
                <span
                  className={cn(
                    "min-w-0 truncate font-mono",
                    row.action === "mint"
                      ? "text-outcome-up"
                      : "text-outcome-down"
                  )}
                >
                  {formatPriceCents(getTapePrice(row))}
                </span>
                <span className="truncate text-center font-mono text-foreground">
                  {formatQuantity(row.quantity)}
                </span>
                <span className="min-w-0 truncate text-right font-mono text-foreground">
                  {formatTradeTime(row.timestampMs)}
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
