import { ArrowUpRightIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SUI_NETWORK } from "@/lib/config"
import { formatPriceCents, formatQuantity, formatTradeTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RedemptionActivityRow, TradeActivityRow } from "@/lib/types/trade"

export interface TradesProps {
  redemptions: RedemptionActivityRow[]
  trades: TradeActivityRow[]
}

type TapeRow =
  | ({ action: "mint" } & TradeActivityRow)
  | ({ action: "sell" } & RedemptionActivityRow)

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

function getTransactionUrl(transactionDigest: string) {
  return `https://suiscan.xyz/${SUI_NETWORK}/tx/${transactionDigest}`
}

export function Trades({ redemptions, trades }: TradesProps) {
  const tapeRows = getTapeRows(trades, redemptions)

  return (
    <Card className="flex h-full w-full flex-col gap-4 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-3 py-2.5 pb-0">
        <CardTitle className="text-sm font-medium">Trades</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto px-0 pt-0 pb-2.5">
        {tapeRows.length > 0 ? (
          <div className="space-y-0.5 px-2">
            <div className="grid grid-cols-[minmax(0,1fr)_3rem_4.75rem_0.75rem] gap-x-1 gap-y-2 px-2 pb-1 text-[10px] tracking-wide text-muted-foreground uppercase sm:grid-cols-[minmax(0,1fr)_3.25rem_4.75rem_0.75rem]">
              <span>Price</span>
              <span className="text-center">Size</span>
              <span className="text-right">Time</span>
              <span className="sr-only">Transaction</span>
            </div>
            {tapeRows.map((row) => (
              <div
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_3rem_4.75rem_0.75rem] items-center gap-x-1 gap-y-2 rounded-sm px-2 py-1.5 text-[10px] tabular-nums sm:grid-cols-[minmax(0,1fr)_3.25rem_4.75rem_0.75rem]",
                  row.action === "mint"
                    ? "bg-outcome-up/5"
                    : "bg-outcome-down/5"
                )}
                key={`${row.action}:${row.id}`}
              >
                <span
                  className={cn(
                    "min-w-0 truncate",
                    row.action === "mint"
                      ? "text-outcome-up"
                      : "text-outcome-down"
                  )}
                >
                  {formatPriceCents(getTapePrice(row))}
                </span>
                <span className="truncate text-center text-foreground">
                  {formatQuantity(row.quantity)}
                </span>
                <span className="min-w-0 truncate text-right text-foreground">
                  {formatTradeTime(row.timestampMs)}
                </span>
                <a
                  aria-label="Open transaction in explorer"
                  className="inline-flex size-3 items-center justify-center text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  href={getTransactionUrl(row.transactionDigest)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ArrowUpRightIcon className="size-3" />
                </a>
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
