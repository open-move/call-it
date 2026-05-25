import { type MarketSnapshot } from "~/lib/callit/market/types"
import {
  type ProRangeRedemption,
  type ProRangeTrade,
  type ProRedemption,
  type ProTrade,
} from "~/lib/callit/pro/types"

import { ActivityTabs } from "./activity-tabs"
import { ChartPanel } from "./chart-panel"
import { Header } from "./header"
import { OrderTicket } from "./order-ticket"
import { Trades } from "./trades"

export interface PageProps {
  market: MarketSnapshot
  rangeRedemptions: ProRangeRedemption[]
  rangeTrades: ProRangeTrade[]
  redemptions: ProRedemption[]
  selectedStrikePriceUsd: number
  trades: ProTrade[]
}

export function Page({
  market,
  rangeRedemptions,
  rangeTrades,
  redemptions,
  selectedStrikePriceUsd,
  trades,
}: PageProps) {
  return (
    <main className="mx-auto w-full max-w-[96rem] px-4 py-4 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,7fr)_minmax(0,2.5fr)] xl:items-stretch">
            <div className="flex min-h-[36rem] flex-col gap-3">
              <Header
                market={market}
                selectedStrikePriceUsd={selectedStrikePriceUsd}
              />
              <ChartPanel
                assetName={market.assetName}
                assetSymbol={market.assetSymbol}
                oracleId={market.oracleId}
                points={market.priceHistory}
                selectedStrikePriceUsd={selectedStrikePriceUsd}
              />
            </div>

            <div className="w-full">
              <Trades trades={trades} />
            </div>

            <ActivityTabs
              rangeRedemptions={rangeRedemptions}
              rangeTrades={rangeTrades}
              redemptions={redemptions}
              trades={trades}
            />
          </div>

          <div className="h-full w-full">
            <OrderTicket
              market={market}
              selectedStrikePriceUsd={selectedStrikePriceUsd}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
