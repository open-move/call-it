import { ArrowUpRightIcon, FlameIcon, TimerIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { AssetIcon } from "@/components/shared/market/asset-icon"
import {
  formatCompactUsd,
  formatExpiryDistance,
  formatProbability,
} from "@/lib/format"
import { formatUpShare } from "@/lib/markets/helpers"
import type { PredictionActivity, TradeMarket } from "@/lib/types/trade"
import { cn } from "@/lib/utils"
import { Metric } from "./metric"
import { Sparkline } from "./sparkline"

export function FeaturedMarkets({
  liveMarketCount,
  markets,
  nearestMarket,
  predictionActivity,
}: {
  liveMarketCount: number
  markets: TradeMarket[]
  nearestMarket?: TradeMarket
  predictionActivity: PredictionActivity
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.58fr)]">
      <div className="rounded-md border-0 bg-card p-3 shadow-none ring-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            <FlameIcon className="size-3.5 translate-y-px text-outcome-down" />
            Top Markets
          </div>
        </div>

        <div className="space-y-0.5">
          {markets.map((market) => (
            <Link
              className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-1.5 transition-[background-color,transform] duration-150 hover:bg-muted/25 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              key={market.id}
              params={{ oracleId: market.oracleId }}
              to="/markets/$oracleId"
            >
              <AssetIcon
                assetIconUrl={market.assetIconUrl}
                assetName={market.assetName}
                assetSymbol={market.assetSymbol}
                className="size-6"
              />
              <div className="min-w-0">
                <div className="truncate text-sm leading-5 font-medium tracking-[-0.01em] text-foreground">
                  {market.assetSymbol}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    Prediction · {formatExpiryDistance(market.expiryMs)}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {formatCompactUsd(market.volumeUsd)}
                  </span>{" "}
                  vol · {market.tradeCount} txns
                </div>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div className="text-sm leading-5 font-semibold text-foreground">
                  {formatProbability(market.fairUpProbability)}
                </div>
                <div
                  className={cn(
                    "text-[11px] leading-4",
                    market.priceChangePercent >= 0
                      ? "text-outcome-up"
                      : "text-outcome-down"
                  )}
                >
                  {market.priceChangePercent >= 0 ? "+" : ""}
                  {market.priceChangePercent.toFixed(2)}%
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-md border-0 bg-card p-3 shadow-none ring-0">
        <div className="relative flex h-full min-h-36 flex-col justify-between gap-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
              <TimerIcon className="size-3.5 translate-y-px text-primary" />
              Prediction Activity
            </div>
          </div>

          <Sparkline
            className="relative h-9 opacity-90"
            points={predictionActivity.volumeSparkline}
          />

          <div className="relative grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <Metric label="Live" value={liveMarketCount.toString()} />
            <Metric
              label="Vol"
              value={formatCompactUsd(predictionActivity.recentVolumeUsd)}
            />
            <Metric
              label="Txns"
              value={predictionActivity.recentTradeCount.toString()}
            />
            <Metric
              label="Up Share"
              value={formatUpShare(predictionActivity)}
            />
          </div>

          {nearestMarket && (
            <Link
              className="group relative inline-flex w-fit items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/85"
              params={{ oracleId: nearestMarket.oracleId }}
              to="/markets/$oracleId"
            >
              Next expiry in {formatExpiryDistance(nearestMarket.expiryMs)}
              <ArrowUpRightIcon className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
