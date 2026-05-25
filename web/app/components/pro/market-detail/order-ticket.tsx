import { useState } from "react"

import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { formatUsd } from "~/lib/callit/format"
import { type MarketSnapshot } from "~/lib/callit/market/types"
import { cn } from "~/lib/utils"

import {
  formatExpiryDistance,
  formatSignedPercent,
  formatSignedUsd,
  getStrikeDistance,
} from "./utils"

type TradeAction = "buy" | "sell"
type ContractSide = "above" | "below"

export interface OrderTicketProps {
  market: MarketSnapshot
  selectedStrikePriceUsd: number
}

function getActionLabel(action: TradeAction) {
  return action === "buy" ? "Buy" : "Sell"
}

function getSideLabel(side: ContractSide) {
  return side === "above" ? "Above" : "Below"
}

export function OrderTicket({
  market,
  selectedStrikePriceUsd,
}: OrderTicketProps) {
  const [tradeAction, setTradeAction] = useState<TradeAction>("buy")
  const [contractSide, setContractSide] = useState<ContractSide>("above")
  const [size, setSize] = useState("25.00")
  const distance = getStrikeDistance(market, selectedStrikePriceUsd)
  const distanceValue = `${formatSignedUsd(distance.distanceUsd)} / ${formatSignedPercent(distance.distancePercent)}`

  return (
    <Card className="h-full w-full rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Trade</CardTitle>
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Review only
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 px-4 pb-4">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-surface-muted/55 p-1">
          {(["buy", "sell"] satisfies TradeAction[]).map((action) => {
            const isSelected = tradeAction === action

            return (
              <Button
                aria-pressed={isSelected}
                className={cn(
                  "h-9 rounded-sm text-sm font-semibold shadow-none ring-0 focus-visible:ring-0",
                  isSelected
                    ? action === "buy"
                      ? "bg-outcome-up-surface text-outcome-up-foreground hover:bg-outcome-up-surface"
                      : "bg-outcome-down-surface text-outcome-down-foreground hover:bg-outcome-down-surface"
                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                )}
                key={action}
                onClick={() => setTradeAction(action)}
                type="button"
                variant="ghost"
              >
                {getActionLabel(action)}
              </Button>
            )
          })}
        </div>

        <div className="space-y-2">
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Side
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["above", "below"] satisfies ContractSide[]).map((side) => {
              const isSelected = contractSide === side

              return (
                <Button
                  aria-pressed={isSelected}
                  className={cn(
                    "h-10 border-0 bg-surface-muted text-sm font-semibold shadow-none ring-0 hover:bg-surface-hover focus-visible:ring-0",
                    isSelected &&
                      (side === "above"
                        ? "bg-outcome-up-surface text-outcome-up-foreground hover:bg-outcome-up-surface"
                        : "bg-outcome-down-surface text-outcome-down-foreground hover:bg-outcome-down-surface")
                  )}
                  key={side}
                  onClick={() => setContractSide(side)}
                  type="button"
                  variant="secondary"
                >
                  {getSideLabel(side)}
                </Button>
              )
            })}
          </div>
        </div>

        <label className="block space-y-2">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {tradeAction === "buy" ? "Size" : "Quantity"}
          </span>
          <div className="relative">
            <Input
              className="h-11 border-0 bg-surface-muted/55 pr-20 font-mono shadow-none ring-0 focus-visible:ring-1"
              inputMode="decimal"
              onChange={(event) => setSize(event.target.value)}
              value={size}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
              {tradeAction === "buy" ? "DUSDC" : "Contracts"}
            </span>
          </div>
        </label>

        <TicketSection title="Execution">
          <TicketRow label="Price" value="--" />
          <TicketRow label="Chance" value="--" />
          {tradeAction === "buy" ? (
            <>
              <TicketRow label="Est. qty" value="--" />
              <TicketRow label="Max cost" value={`${size || "0"} DUSDC`} />
            </>
          ) : (
            <>
              <TicketRow label="Position" value="--" />
              <TicketRow label="Est. return" value="--" />
            </>
          )}
        </TicketSection>

        <TicketSection title="Contract">
          <TicketRow
            label="Side"
            value={`${getSideLabel(contractSide)} ${formatUsd(selectedStrikePriceUsd, 0)}`}
          />
          <TicketRow
            label="Spot"
            value={formatUsd(market.currentPriceUsd, 0)}
          />
          <TicketRow label="Distance" value={distanceValue} />
          <TicketRow
            label="Expires"
            value={formatExpiryDistance(market.expiryMs)}
          />
        </TicketSection>

        <p className="rounded-md bg-surface-muted/45 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Transaction routing and wallet position reads are not connected yet.
        </p>

        <Button className="h-11 w-full" disabled type="button">
          Trading coming soon
        </Button>
      </CardContent>
    </Card>
  )
}

function TicketSection({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <div className="space-y-2 rounded-md bg-surface-muted/35 p-3 text-sm">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate text-right font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}
