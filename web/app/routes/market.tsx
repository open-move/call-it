import { useState } from "react"

import type { Route } from "./+types/market"
import { AppFrame } from "~/components/app-frame/app-frame"
import { PriceChart } from "~/components/market-detail/price-chart"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { formatCompactUsd } from "~/lib/callit/format"
import { getCryptoPredictionMarket } from "~/lib/callit/market-data"
import { cn } from "~/lib/utils"

type TradeSide = "buy" | "sell"

export function loader({ params }: Route.LoaderArgs) {
  const marketId = params.marketId
  const market = marketId ? getCryptoPredictionMarket(marketId) : undefined

  if (!market) {
    throw new Response("Market not found", { status: 404 })
  }

  return { market }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/35 py-2 text-sm last:border-b-0">
      <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

export default function Market({ loaderData }: Route.ComponentProps) {
  const { market } = loaderData
  const [tradeSide, setTradeSide] = useState<TradeSide>("buy")
  const [selectedOutcome, setSelectedOutcome] = useState(market.outcomes[0].value)
  const [amount, setAmount] = useState("25.00")
  const selectedOutcomeLabel =
    market.outcomes.find((outcome) => outcome.value === selectedOutcome)?.label ?? "Up"
  const downPercent = 100 - market.primaryOutcomePercent
  const selectedOutcomePercent =
    selectedOutcome === market.outcomes[0].value ? market.primaryOutcomePercent : downPercent
  const trend = market.priceChangePercent >= 0 ? "up" : "down"

  return (
    <AppFrame>
      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <section className="py-1">
          <div className="flex min-w-0 items-start gap-2.5">
            <img
              alt={`${market.assetName} icon`}
              className="size-7 shrink-0 rounded-full sm:size-8"
              src={market.assetIconUrl}
            />
            <div className="min-w-0">
              <h1 className="max-w-2xl text-lg leading-tight font-semibold tracking-tight text-foreground sm:text-xl">
                {market.prompt}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{formatCompactUsd(market.volumeUsd)} volume</span>
                <span>·</span>
                <span>{market.durationLabel} window</span>
                <span>·</span>
                <span>{market.primaryOutcomePercent}% Up</span>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-4">
            <Card className="rounded-md bg-surface-raised py-5 ring-0 shadow-none" size="sm">
              <CardContent className="px-4 sm:px-5">
                <PriceChart points={market.priceHistory} trend={trend} />
              </CardContent>
            </Card>

            <section className="space-y-2 py-2">
              <h2 className="text-sm font-semibold text-foreground">Rules</h2>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                This market uses the asset price at the end of the {market.durationLabel} window.
                Choose {market.outcomes[0].label} if you think the final price will be higher.
                Choose {market.outcomes[1].label} if you think it will be lower.
              </p>
            </section>

            <section className="space-y-3 py-2">
              <h2 className="text-sm font-semibold text-foreground">Market info</h2>
              <div>
                <DetailRow label="Status" value={market.statusLabel} />
                <DetailRow label="Ends in" value={market.durationLabel} />
                <DetailRow label="Price update" value={market.priceUpdatedLabel} />
                <DetailRow label="Trades" value={market.tradeCount.toString()} />
                <DetailRow label="Volume" value={formatCompactUsd(market.volumeUsd)} />
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
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
                        !isSelected && "border-border/40 bg-surface-muted text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                        !isSelected && isPrimaryOutcome && "hover:border-outcome-up-border/50 hover:text-outcome-up",
                        !isSelected && !isPrimaryOutcome && "hover:border-outcome-down-border/50 hover:text-outcome-down",
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
                <span className="text-xs font-medium text-muted-foreground">Amount</span>
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
                  value={`${tradeSide === "buy" ? "Buy" : "Sell"} ${market.assetSymbol} ${selectedOutcomeLabel}`}
                />
                <DetailRow label="Amount" value={`${amount || "0.00"} USDC`} />
                <DetailRow
                  label="Market"
                  value={`${selectedOutcomePercent}% ${selectedOutcomeLabel}`}
                />
              </div>

              <Button className="h-11 w-full" type="button">
                Review {tradeSide === "buy" ? "Buy" : "Sell"}
              </Button>
            </div>
          </aside>
        </div>
      </main>
    </AppFrame>
  )
}
