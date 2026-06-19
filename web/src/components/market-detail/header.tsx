import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "@tanstack/react-router"

import { BadgeTone } from "@/components/primitives/badge"
import { DetailHeader } from "@/components/shared/detail/detail-header"
import { AssetIcon } from "@/components/shared/market/asset-icon"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  formatExpiryDistance,
  formatMarketTitleExpiry,
  formatProbability,
  formatStatus,
  formatUsd,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import type { MarketSnapshot } from "@/lib/types/market"
import type { TradeMarket } from "@/lib/types/trade"

export interface HeaderProps {
  market: MarketSnapshot
  marketOptions: TradeMarket[]
  selectedStrikePriceUsd: number
}

function getStatusTone(status: string) {
  if (status === "active") {
    return BadgeTone.Live
  }

  if (status === "expired") {
    return BadgeTone.Warning
  }

  return BadgeTone.Neutral
}

function getMarketDisplayStatus(market: MarketSnapshot) {
  return market.expiryMs <= Date.now() ? "expired" : market.status
}

function filterMarketOptions(markets: TradeMarket[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return markets
  }

  return markets.filter((market) =>
    [market.assetName, market.assetSymbol, market.oracleId]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  )
}

function MarketSelector({
  market,
  marketOptions,
}: {
  market: MarketSnapshot
  marketOptions: TradeMarket[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const visibleMarkets = filterMarketOptions(marketOptions, query)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)

        if (!nextOpen) {
          setQuery("")
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            className="h-auto min-w-0 justify-start gap-2 px-0 py-0 text-left hover:bg-transparent focus-visible:ring-2 focus-visible:ring-primary/30 aria-expanded:bg-transparent"
            size="sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <AssetIcon
          assetIconUrl={market.assetIconUrl}
          assetName={market.assetName}
          assetSymbol={market.assetSymbol}
          className="size-5"
        />
        <span className="min-w-0 truncate text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          {market.assetSymbol}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            Prediction · {formatMarketTitleExpiry(market.expiryMs)}
          </span>
        </span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform group-aria-expanded/button:rotate-180" />
      </DialogTrigger>

      <DialogContent
        className="max-h-[min(36rem,calc(100vh-2rem))] gap-0 overflow-hidden rounded-md border-0 bg-card p-0 shadow-none ring-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogClose
          render={
            <Button
              aria-label="Close market selector"
              className="absolute top-2.5 right-3 text-muted-foreground hover:bg-muted/35 hover:text-foreground"
              size="icon-xs"
              type="button"
              variant="ghost"
            />
          }
        >
          <XIcon className="size-3.5" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <DialogHeader className="border-b border-border/45 px-4 py-3 pr-12">
          <DialogTitle className="text-sm">Select Market</DialogTitle>
        </DialogHeader>

        <div className="px-4 pt-3 pb-2">
          <label className="relative block">
            <span className="sr-only">Search markets</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="border-border/35 bg-muted/25 pl-8 text-xs shadow-none ring-0 transition-[background-color,border-color,color] duration-150 placeholder:text-muted-foreground/65 hover:bg-muted/30 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search asset, expiry, or oracle..."
              value={query}
            />
          </label>
        </div>

        <div className="max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto px-2 py-2">
          {visibleMarkets.length > 0 ? (
            <div className="grid gap-1">
              {visibleMarkets.map((option) => {
                const isSelected = option.oracleId === market.oracleId

                return (
                  <Link
                    className={cn(
                      "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2.5 py-2.5 transition-[background-color,color,transform] duration-150 hover:bg-muted/25 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
                      isSelected && "bg-primary/8 text-primary hover:bg-primary/12"
                    )}
                    key={option.oracleId}
                    onClick={() => setOpen(false)}
                    params={{ oracleId: option.oracleId }}
                    to="/markets/$oracleId"
                  >
                    <AssetIcon
                      assetIconUrl={option.assetIconUrl}
                      assetName={option.assetName}
                      assetSymbol={option.assetSymbol}
                      className="size-5"
                    />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-sm leading-5 font-medium tracking-[-0.01em] text-foreground">
                          {option.assetSymbol}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            Prediction · {formatMarketTitleExpiry(option.expiryMs)}
                          </span>
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="font-mono tabular-nums">
                          Spot {formatUsd(option.currentPriceUsd, 0)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div className="font-mono tabular-nums">
                        <div className="text-sm leading-5 font-semibold text-foreground">
                          {formatProbability(option.fairUpProbability)}
                        </div>
                        <div
                          className={cn(
                            "text-[11px] leading-4",
                            option.priceChangePercent >= 0
                              ? "text-outcome-up"
                              : "text-outcome-down"
                          )}
                        >
                          {option.priceChangePercent >= 0 ? "+" : ""}
                          {option.priceChangePercent.toFixed(2)}%
                        </div>
                      </div>
                      {isSelected ? (
                        <CheckIcon className="size-4 text-primary" />
                      ) : (
                        <span className="size-4 text-muted-foreground/40" />
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="flex min-h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
              No markets match that search.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Header({
  market,
  marketOptions,
  selectedStrikePriceUsd,
}: HeaderProps) {
  const displayStatus = getMarketDisplayStatus(market)
  const title = `${market.assetSymbol} Prediction · ${formatMarketTitleExpiry(market.expiryMs)}`

  return (
    <DetailHeader
      assetIconUrl={market.assetIconUrl}
      assetName={market.assetName}
      assetSymbol={market.assetSymbol}
      badgeLabel={formatStatus(displayStatus)}
      badgeTone={getStatusTone(displayStatus)}
      identity={
        <MarketSelector
          market={market}
          marketOptions={marketOptions}
        />
      }
      metrics={[
        {
          description: "Latest oracle spot price for the underlying asset.",
          label: "Spot",
          value: formatUsd(market.currentPriceUsd, 0),
        },
        {
          description: "Selected settlement threshold for this ticket.",
          label: "Strike",
          value: formatUsd(selectedStrikePriceUsd, 0),
        },
        {
          description: "Time remaining until this market expiry.",
          label: "Expires",
          value: formatExpiryDistance(market.expiryMs),
        },
        {
          description: "Current fair Up probability from Predict market data.",
          label: "Up Prob.",
          value: formatProbability(market.fairUpProbability),
        },
      ]}
      title={title}
    />
  )
}
