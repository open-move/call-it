import { AssetIcon } from "~/components/shared/market/asset-icon"
import { PriceChart } from "~/components/shared/market/price-chart"
import { DetailRow } from "~/components/shared/data-display/detail-row"
import { formatCompactUsd, formatUsd } from "~/lib/callit/format"
import { type SimpleMarket } from "~/lib/callit/simple/types"

import { Rules } from "./rules"
import { Stats } from "./stats"
import { TradePanel } from "./trade-panel"

export interface PageProps {
  market: SimpleMarket
}

export function Page({ market }: PageProps) {
  const trend = market.priceChangePercent >= 0 ? "up" : "down"

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <section className="py-1">
        <div className="flex min-w-0 items-start gap-2.5">
          <AssetIcon
            assetIconUrl={market.assetIconUrl}
            assetName={market.assetName}
            assetSymbol={market.assetSymbol}
          />
          <div className="min-w-0">
            <h1 className="max-w-2xl text-lg leading-tight font-semibold tracking-tight text-foreground sm:text-xl">
              {market.prompt}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {market.volumeUsd !== undefined && (
                <>
                  <span>{formatCompactUsd(market.volumeUsd)} volume</span>
                  <span>·</span>
                </>
              )}
              <span>{market.durationLabel}</span>
              <span>·</span>
              <span>{formatUsd(market.currentPriceUsd, 0)} now</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <Stats market={market} />

          <PriceChart
            points={market.priceHistory}
            strikePriceUsd={market.strikePriceUsd}
            trend={trend}
          />

          <Rules market={market} />

          <section className="space-y-3 py-2">
            <h2 className="text-sm font-semibold text-foreground">
              Market info
            </h2>
            <div>
              <DetailRow label="Status" value={market.statusLabel} />
              <DetailRow label="Ends in" value={market.durationLabel} />
              <DetailRow label="Settlement" value={market.expiryLabel} />
              <DetailRow
                label="Strike"
                value={formatUsd(market.strikePriceUsd, 0)}
              />
              <DetailRow
                label="Price update"
                value={market.priceUpdatedLabel}
              />
              {market.tradeCount !== undefined && (
                <DetailRow
                  label="Trades"
                  value={market.tradeCount.toString()}
                />
              )}
              {market.volumeUsd !== undefined && (
                <DetailRow
                  label="Volume"
                  value={formatCompactUsd(market.volumeUsd)}
                />
              )}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <TradePanel market={market} />
        </aside>
      </div>
    </main>
  )
}
