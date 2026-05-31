import { useState } from "react"

import { DetailRow } from "~/components/shared/data-display/detail-row"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { formatUsd } from "~/lib/callit/format"
import { type SimpleMarket } from "~/lib/callit/simple/types"
import { cn } from "~/lib/utils"

type TradeSide = "buy" | "sell"

export interface TradePanelProps {
  market: SimpleMarket
}

function isTradeSide(value: unknown): value is TradeSide {
  return value === "buy" || value === "sell"
}

export function TradePanel({ market }: TradePanelProps) {
  const [tradeSide, setTradeSide] = useState<TradeSide>("buy")
  const [selectedOutcome, setSelectedOutcome] = useState(
    market.outcomes[0].value
  )
  const [amount, setAmount] = useState("")
  const selectedOutcomeLabel =
    market.outcomes.find((outcome) => outcome.value === selectedOutcome)
      ?.label ?? market.outcomes[0].label
  const amountLabel = `${amount || "0.00"} USDC`

  return (
    <div className="space-y-4">
      <Tabs
        className="gap-0"
        onValueChange={(value) => {
          if (isTradeSide(value)) {
            setTradeSide(value)
          }
        }}
        value={tradeSide}
      >
        <TabsList className="h-9 w-full overflow-hidden rounded-md bg-muted p-0">
          {(["buy", "sell"] satisfies TradeSide[]).map((side) => (
            <TabsTrigger
              className="!h-full rounded-none border-0 !border-transparent text-sm font-semibold capitalize shadow-none ring-0 outline-none after:hidden focus-visible:!border-transparent focus-visible:!ring-0 focus-visible:!outline-none data-active:!border-transparent data-active:!bg-primary/10 data-active:!text-primary dark:data-active:!border-transparent"
              key={side}
              value={side}
            >
              {side}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-2 gap-2">
        {market.outcomes.map((outcome) => {
          const isSelected = selectedOutcome === outcome.value
          const isPrimaryOutcome = outcome.value === market.outcomes[0].value

          return (
            <Button
              className={cn(
                "h-11 justify-center border-transparent px-3 text-sm font-semibold shadow-none",
                !isSelected &&
                  "border-border/40 bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                !isSelected &&
                  isPrimaryOutcome &&
                  "hover:border-outcome-up-border/50 hover:text-outcome-up",
                !isSelected &&
                  !isPrimaryOutcome &&
                  "hover:border-outcome-down-border/50 hover:text-outcome-down",
                isSelected &&
                  isPrimaryOutcome &&
                  "border-outcome-up-border bg-outcome-up/10 text-outcome-up ring-1 ring-outcome-up-border/30 hover:bg-outcome-up/15",
                isSelected &&
                  !isPrimaryOutcome &&
                  "border-outcome-down-border bg-outcome-down/10 text-outcome-down ring-1 ring-outcome-down-border/30 hover:bg-outcome-down/15"
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
            className="h-11 border-transparent pr-14 font-mono shadow-none focus-visible:border-ring"
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
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
