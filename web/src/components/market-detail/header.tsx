import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "@tanstack/react-router"

import { BadgeTone } from "@/components/primitives/badge"
import { DetailHeader } from "@/components/shared/detail/detail-header"
import { AssetIcon } from "@/components/shared/market/asset-icon"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatUsd,
  formatExpiryDistance,
  formatMarketTitleExpiry,
  formatProbability,
  formatStatus } from "@/lib/format"
import type {MarketSnapshot} from "@/lib/types/market";
import type {TradeMarket, ToolbarQuote} from "@/lib/types/trade";
import { formatUnitPrice } from "@/lib/amounts"
import { QUOTE_QUANTITY as TOOLBAR_QUOTE_QUANTITY } from "@/lib/config"
import { cn } from "@/lib/utils"

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
  return status === "active" ? BadgeTone.Live : BadgeTone.Neutral
}

function getMarketHref(market: TradeMarket) {
  const searchParams = new URLSearchParams({
    strike: market.strikePriceUsd.toString(),
  })

  return `/markets/${market.oracleId}?${searchParams.toString()}`
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

      <DialogContent className="max-h-[min(42rem,calc(100vh-2rem))] gap-0 overflow-hidden rounded-xl bg-card p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border/45 px-4 py-3">
          <DialogTitle className="text-base">Select market</DialogTitle>
          <DialogDescription className="text-xs">
            Switch expiry or asset without leaving the trading layout.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-border/35 px-4 py-3">
          <label className="relative block">
            <span className="sr-only">Search markets</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="border-0 bg-muted/60 pl-8 text-xs shadow-none ring-0 focus-visible:ring-1"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search markets..."
              value={query}
            />
          </label>
        </div>

        <div className="max-h-[min(30rem,calc(100vh-13rem))] overflow-y-auto px-2 py-2">
          {visibleMarkets.length > 0 ? (
            <div className="grid gap-1">
              {visibleMarkets.map((option) => {
                const isSelected = option.oracleId === market.oracleId

                return (
                  <Link
                    className={cn(
                      "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                      isSelected && "bg-primary/10 text-primary hover:bg-primary/15"
                    )}
                    key={option.oracleId}
                    to={getMarketHref(option)}
                  >
                    <AssetIcon
                      assetIconUrl={option.assetIconUrl}
                      assetName={option.assetName}
                      assetSymbol={option.assetSymbol}
                      className="size-7"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {option.assetSymbol} Prediction ·{" "}
                        {formatMarketTitleExpiry(option.expiryMs)}
                      </div>
                      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="font-mono tabular-nums">
                          Spot {formatUsd(option.currentPriceUsd, 0)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Expires {formatExpiryDistance(option.expiryMs)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div className="font-mono tabular-nums">
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
                        <span className="size-4" />
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
  const title = `${market.assetSymbol} Prediction · ${formatMarketTitleExpiry(market.expiryMs)}`

  return (
    <DetailHeader
      assetIconUrl={market.assetIconUrl}
      assetName={market.assetName}
      assetSymbol={market.assetSymbol}
      badgeLabel={formatStatus(market.status)}
      badgeTone={getStatusTone(market.status)}
      identity={
        <MarketSelector
          market={market}
          marketOptions={marketOptions}
          title={title}
        />
      }
      metrics={[
        { label: "Price (Up)", value: quoteValue },
        { label: "Spread", value: spreadValue },
        { label: "Spot", value: formatUsd(market.currentPriceUsd, 0) },
        { label: "Min Strike", value: formatUsd(market.minStrikeUsd, 0) },
        { label: "Expires", value: formatExpiryDistance(market.expiryMs) },
      ]}
      title={title}
    />
  )
}
