import { Card } from "~/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { formatRelativeTime, formatUsd } from "~/lib/callit/format"
import {
  type ProRangeRedemption,
  type ProRangeTrade,
  type ProRedemption,
  type ProTrade,
} from "~/lib/callit/pro/types"
import { cn } from "~/lib/utils"

export interface ActivityTabsProps {
  rangeRedemptions: ProRangeRedemption[]
  rangeTrades: ProRangeTrade[]
  redemptions: ProRedemption[]
  trades: ProTrade[]
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatCostUsd(value: number) {
  return value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  })
}

function formatPriceCents(price: number) {
  return `${(price * 100).toFixed(1)}c`
}

function formatQuantity(quantity: number) {
  return quantity.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })
}

function formatRange(
  lowerStrikePriceUsd: number,
  higherStrikePriceUsd: number
) {
  return `${formatUsd(lowerStrikePriceUsd, 0)}-${formatUsd(higherStrikePriceUsd, 0)}`
}

export function ActivityTabs({
  rangeRedemptions,
  rangeTrades,
  redemptions,
  trades,
}: ActivityTabsProps) {
  return (
    <Card className="h-[24rem] min-w-0 rounded-md border-0 bg-card py-0 shadow-none ring-0 xl:col-span-2">
      <Tabs
        className="flex h-full min-h-0 flex-col gap-0"
        defaultValue="positions"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/45 px-4">
          <TabsList
            className="h-full w-full justify-start gap-6 overflow-x-auto rounded-none p-0"
            variant="line"
          >
            <TabsTrigger
              className="h-full flex-none rounded-none px-0"
              value="positions"
            >
              Positions
            </TabsTrigger>
            <TabsTrigger
              className="h-full flex-none rounded-none px-0"
              value="trades"
            >
              Trades ({trades.length})
            </TabsTrigger>
            <TabsTrigger
              className="h-full flex-none rounded-none px-0"
              value="ranges"
            >
              Ranges ({rangeTrades.length})
            </TabsTrigger>
            <TabsTrigger
              className="h-full flex-none rounded-none px-0"
              value="redemptions"
            >
              Redemptions ({redemptions.length + rangeRedemptions.length})
            </TabsTrigger>
          </TabsList>
          <div className="hidden shrink-0 font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:block">
            Predict activity
          </div>
        </div>

        <TabsContent
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          value="positions"
        >
          <EmptyState message="Connect wallet to view open positions." />
        </TabsContent>

        <TabsContent className="min-h-0 flex-1 overflow-auto" value="trades">
          {trades.length > 0 ? (
            <TradesTable trades={trades} />
          ) : (
            <EmptyState message="No trades for this contract yet." />
          )}
        </TabsContent>

        <TabsContent className="min-h-0 flex-1 overflow-auto" value="ranges">
          {rangeTrades.length > 0 ? (
            <RangeTradesTable trades={rangeTrades} />
          ) : (
            <EmptyState message="No range activity around this strike yet." />
          )}
        </TabsContent>

        <TabsContent
          className="min-h-0 flex-1 overflow-auto"
          value="redemptions"
        >
          {redemptions.length > 0 || rangeRedemptions.length > 0 ? (
            <RedemptionsTable
              rangeRedemptions={rangeRedemptions}
              redemptions={redemptions}
            />
          ) : (
            <EmptyState message="No redemptions for this contract yet." />
          )}
        </TabsContent>
      </Tabs>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function HeaderRow({ columns }: { columns: string[] }) {
  return (
    <div className="grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 border-b border-border/45 px-4 py-3 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
      {columns.map((column) => (
        <span className="truncate last:text-right" key={column}>
          {column}
        </span>
      ))}
    </div>
  )
}

function TradesTable({ trades }: { trades: ProTrade[] }) {
  return (
    <div className="min-w-[44rem] divide-y divide-border/35">
      <HeaderRow
        columns={["Time", "Side", "Price", "Trader", "Size", "Cost"]}
      />
      {trades.map((trade) => (
        <div
          className="grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 px-4 py-3 text-xs"
          key={trade.id}
        >
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatRelativeTime(trade.timestampMs)}
          </span>
          <span
            className={cn(
              "font-medium capitalize",
              trade.side === "above" ? "text-outcome-up" : "text-outcome-down"
            )}
          >
            {trade.side}
          </span>
          <span className="font-mono tabular-nums">
            {formatPriceCents(trade.price)}
          </span>
          <AddressText address={trade.trader} />
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatQuantity(trade.quantity)}
          </span>
          <span className="text-right font-mono tabular-nums">
            {formatCostUsd(trade.costUsd)}
          </span>
        </div>
      ))}
    </div>
  )
}

function RangeTradesTable({ trades }: { trades: ProRangeTrade[] }) {
  return (
    <div className="min-w-[44rem] divide-y divide-border/35">
      <HeaderRow
        columns={["Time", "Range", "Price", "Trader", "Size", "Cost"]}
      />
      {trades.map((trade) => (
        <div
          className="grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 px-4 py-3 text-xs"
          key={trade.id}
        >
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatRelativeTime(trade.timestampMs)}
          </span>
          <span className="font-mono tabular-nums">
            {formatRange(trade.lowerStrikePriceUsd, trade.higherStrikePriceUsd)}
          </span>
          <span className="font-mono tabular-nums">
            {formatPriceCents(trade.price)}
          </span>
          <AddressText address={trade.trader} />
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatQuantity(trade.quantity)}
          </span>
          <span className="text-right font-mono tabular-nums">
            {formatCostUsd(trade.costUsd)}
          </span>
        </div>
      ))}
    </div>
  )
}

function RedemptionsTable({
  rangeRedemptions,
  redemptions,
}: {
  rangeRedemptions: ProRangeRedemption[]
  redemptions: ProRedemption[]
}) {
  return (
    <div className="min-w-[44rem] divide-y divide-border/35">
      <HeaderRow
        columns={["Time", "Type", "Price", "Owner", "Size", "Payout"]}
      />
      {redemptions.map((redemption) => (
        <div
          className="grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 px-4 py-3 text-xs"
          key={redemption.id}
        >
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatRelativeTime(redemption.timestampMs)}
          </span>
          <span
            className={cn(
              "font-medium capitalize",
              redemption.side === "above"
                ? "text-outcome-up"
                : "text-outcome-down"
            )}
          >
            {redemption.side}
          </span>
          <span className="font-mono tabular-nums">
            {formatPriceCents(redemption.bidPrice)}
          </span>
          <AddressText address={redemption.owner} />
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatQuantity(redemption.quantity)}
          </span>
          <span className="text-right font-mono tabular-nums">
            {formatCostUsd(redemption.payoutUsd)}
          </span>
        </div>
      ))}
      {rangeRedemptions.map((redemption) => (
        <div
          className="grid grid-cols-[6rem_6rem_7rem_1fr_8rem_7rem] gap-4 px-4 py-3 text-xs"
          key={redemption.id}
        >
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatRelativeTime(redemption.timestampMs)}
          </span>
          <span className="font-mono tabular-nums">
            {formatRange(
              redemption.lowerStrikePriceUsd,
              redemption.higherStrikePriceUsd
            )}
          </span>
          <span className="font-mono tabular-nums">
            {formatPriceCents(redemption.bidPrice)}
          </span>
          <AddressText address={redemption.trader} />
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatQuantity(redemption.quantity)}
          </span>
          <span className="text-right font-mono tabular-nums">
            {formatCostUsd(redemption.payoutUsd)}
          </span>
        </div>
      ))}
    </div>
  )
}

function AddressText({ address }: { address: string }) {
  return (
    <span className="truncate font-mono text-muted-foreground tabular-nums">
      {formatAddress(address)}
    </span>
  )
}
