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
import { Sparkline } from "./sparkline"

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

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
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.58fr)]">
      <div className="flex flex-col rounded-lg bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            <FlameIcon className="size-3.5 translate-y-px text-outcome-down" />
            Top markets
          </div>
        </div>

        <div className="space-y-0.5">
          {markets.map((market, index) => (
            <Link
              className="group grid grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-1.5 transition-[background-color,transform] duration-150 hover:bg-muted/25 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              key={market.id}
              params={{ oracleId: market.oracleId }}
              to="/markets/$oracleId"
            >
              <span className="text-center font-mono text-[11px] text-muted-foreground tabular-nums">
                {index + 1}
              </span>
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

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/30 pt-2.5 text-[11px] text-muted-foreground">
          <span>Top by 24h volume</span>
          <span className="font-mono tabular-nums">{liveMarketCount} live</span>
        </div>
      </div>

      <div className="rounded-lg bg-card p-4">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            <TimerIcon className="size-3.5 translate-y-px text-primary" />
            Prediction activity
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Recent volume</div>
            <div className="mt-1 font-mono text-lg leading-none font-medium tracking-tight text-foreground tabular-nums">
              {formatCompactUsd(predictionActivity.recentVolumeUsd)}
            </div>
          </div>

          <Sparkline
            className="h-12 opacity-90"
            points={predictionActivity.volumeSparkline}
          />

          <div className="grid grid-cols-3 gap-3">
            <StatItem label="Live" value={liveMarketCount.toString()} />
            <StatItem
              label="Txns"
              value={predictionActivity.recentTradeCount.toString()}
            />
            <StatItem label="Up share" value={formatUpShare(predictionActivity)} />
          </div>

          {nearestMarket && (
            <Link
              className="group inline-flex w-fit items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/85"
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
