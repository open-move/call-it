import { useState } from "react"

import { DetailRow } from "~/components/shared/data-display/detail-row"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { formatUsd } from "~/lib/callit/format"
import { type SimpleMarket } from "~/lib/callit/simple/types"
import { cn } from "~/lib/utils"

type TradeSide = "buy" | "sell"

export interface TradePanelProps {
  market: SimpleMarket
}

export function TradePanel({ market }: TradePanelProps) {
  const [tradeSide, setTradeSide] = useState<TradeSide>("buy")
  const [selectedOutcome, setSelectedOutcome] = useState(
    market.outcomes[0].value
  )
  const [amount, setAmount] = useState("25.00")
  const selectedOutcomeLabel =
    market.outcomes.find((outcome) => outcome.value === selectedOutcome)
      ?.label ?? market.outcomes[0].label
  const amountLabel = `${amount || "0.00"} USDC`

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-md bg-surface-muted p-1 text-xs font-semibold">
        {(["buy", "sell"] satisfies TradeSide[]).map((side) => (
          <button
            aria-pressed={tradeSide === side}
            className={cn(
              "rounded px-3 py-2 text-center capitalize transition-colors",
              tradeSide === side
                ? "bg-primary/15 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={side}
            onClick={() => setTradeSide(side)}
            type="button"
          >
            {side}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {market.outcomes.map((outcome) => {
          const isSelected = selectedOutcome === outcome.value
          const isPrimaryOutcome = outcome.value === market.outcomes[0].value

          return (
            <Button
              className={cn(
                "h-11 justify-center border-transparent px-3 text-sm font-semibold shadow-none",
                !isSelected &&
                  "border-border/40 bg-surface-muted text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                !isSelected &&
                  isPrimaryOutcome &&
                  "hover:border-outcome-up-border/50 hover:text-outcome-up",
                !isSelected &&
                  !isPrimaryOutcome &&
                  "hover:border-outcome-down-border/50 hover:text-outcome-down",
                isSelected &&
                  isPrimaryOutcome &&
                  "border-outcome-up-border bg-outcome-up-surface text-outcome-up-foreground ring-1 ring-outcome-up-border/30 hover:bg-outcome-up-surface/90",
                isSelected &&
                  !isPrimaryOutcome &&
                  "border-outcome-down-border bg-outcome-down-surface text-outcome-down-foreground ring-1 ring-outcome-down-border/30 hover:bg-outcome-down-surface/90"
              )}
              key={outcome.value}
              onClick={() => setSelectedOutcome(outcome.value)}
              type="button"
              variant="outline"
            >
              <span>{outcome.label}</span>
            </Button>
          )
        })}
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-medium text-muted-foreground">
          Amount
        </span>
        <div className="relative">
          <Input
            className="h-11 border-transparent bg-surface-muted pr-14 font-mono shadow-none focus-visible:border-ring"
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="25.00"
            type="text"
            value={amount}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground">
            USDC
          </span>
        </div>
      </label>

      <div className="text-sm">
        <DetailRow
          label="Action"
          value={`${tradeSide === "buy" ? "Buy" : "Sell"} ${selectedOutcomeLabel}`}
        />
        <DetailRow label="Risk" value={amountLabel} />
        <DetailRow label="Potential payout" value="Quoted at review" />
        <DetailRow
          label="Settlement"
          value={`Above ${formatUsd(market.strikePriceUsd, 0)}`}
        />
      </div>

      <Button className="h-11 w-full" disabled type="button">
        Review coming soon
      </Button>
    </div>
  )
}
