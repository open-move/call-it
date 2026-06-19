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
import { formatUnitPrice } from "@/lib/amounts"
import { QUOTE_QUANTITY as TOOLBAR_QUOTE_QUANTITY } from "@/lib/config"
import { cn } from "@/lib/utils"
import type { MarketSnapshot } from "@/lib/types/market"
import type { TradeMarket, ToolbarQuote } from "@/lib/types/trade"

export interface HeaderProps {
  market: MarketSnapshot
  marketOptions: TradeMarket[]
  selectedStrikePriceUsd: number
  toolbarQuote: ToolbarQuote | null
}

function formatToolbarPrice(value: number | undefined) {
  return value === undefined
    ? "--"
    : formatUnitPrice(BigInt(value), TOOLBAR_QUOTE_QUANTITY)
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
  title,
}: {
  market: MarketSnapshot
  marketOptions: TradeMarket[]
  title: string
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
            className="h-auto min-w-0 justify-start gap-2 px-0 py-0 text-left hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring/40 aria-expanded:bg-transparent"
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
        <span className="min-w-0 truncate text-sm leading-none font-medium tracking-tight text-foreground">
          {title}
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
              className="absolute top-2.5 right-3 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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
              className="border-0 pl-8 text-xs shadow-none ring-0 focus-visible:ring-1"
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
                      "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                      isSelected && "bg-primary/10 text-primary hover:bg-primary/12"
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
                        <div className="truncate text-sm leading-none font-medium tracking-tight text-foreground">
                          {option.assetSymbol} Prediction ·{" "}
                          {formatMarketTitleExpiry(option.expiryMs)}
                        </div>
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">
                          Spot {formatUsd(option.currentPriceUsd, 0)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div className="tabular-nums">
                        <div className="text-sm font-medium text-foreground">
                          {formatProbability(option.fairUpProbability)}
                        </div>
                        <div
                          className={cn(
                            "text-[10px]",
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

export function Header({ market, marketOptions, toolbarQuote }: HeaderProps) {
  const quoteValue = formatToolbarPrice(toolbarQuote?.aboveAsk)
  const spreadValue = formatToolbarPrice(toolbarQuote?.spread)
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
          title={title}
        />
      }
      metrics={[
        {
          description: "Current ask price to open an Up position for this market.",
          label: "Price (Up)",
          value: quoteValue,
        },
        {
          description: "Difference between the current bid and ask quotes.",
          label: "Spread",
          value: spreadValue,
        },
        {
          description: "Latest oracle spot price for the underlying asset.",
          label: "Spot",
          value: formatUsd(market.currentPriceUsd, 0),
        },
        {
          description: "Lowest strike currently listed for this market expiry.",
          label: "Min Strike",
          value: formatUsd(market.minStrikeUsd, 0),
        },
        {
          description: "Time remaining until this market expiry.",
          label: "Expires",
          value: formatExpiryDistance(market.expiryMs),
        },
      ]}
      title={title}
    />
  )
}
