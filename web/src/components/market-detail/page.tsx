import { useState } from "react"

import {
  type ExpiryOption,
  type MarketSnapshot,
} from "@/lib/callit/market/types"
import {
  type PositionTradeIntent,
  type RangeRedemption,
  type RangeTrade,
  type Redemption,
  type TradeMarket,
  type ToolbarQuote,
  type Trade,
} from "@/lib/callit/trade/types"
import {
  getRedemptionActivityRows,
  getTradeActivityRows,
} from "@/lib/callit/trade/activity"

import { ActivityTabs } from "./activity-tabs"
import { ChartPanel } from "./chart-panel"
import { ExpiryStrip } from "./expiry-strip"
import { Header } from "./header"
import { OrderTicket } from "./order-ticket"
import { Trades } from "./trades"
import { Card } from "@/components/ui/card"

export interface PageProps {
  expiryOptions: ExpiryOption[]
  initialSide?: "above" | "below"
  market: MarketSnapshot
  marketOptions: TradeMarket[]
  rangeRedemptions: RangeRedemption[]
  rangeTrades: RangeTrade[]
  redemptions: Redemption[]
  selectedStrikePriceUsd: number
  toolbarQuote: ToolbarQuote | null
  trades: Trade[]
}

export function Page({
  expiryOptions,
  initialSide,
  market,
  marketOptions,
  rangeRedemptions,
  rangeTrades,
  redemptions,
  selectedStrikePriceUsd,
  toolbarQuote,
  trades,
}: PageProps) {
  const [tradeIntent, setTradeIntent] = useState<PositionTradeIntent>()
  const tradeActivityRows = getTradeActivityRows(trades, rangeTrades)
  const redemptionActivityRows = getRedemptionActivityRows(
    redemptions,
    rangeRedemptions
  )

  return (
    <main className="mx-auto w-full max-w-384 px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,7fr)_minmax(0,2.5fr)] xl:items-stretch">
          <div className="h-120 min-w-0">
            <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
              <Header
                market={market}
                marketOptions={marketOptions}
                selectedStrikePriceUsd={selectedStrikePriceUsd}
                toolbarQuote={toolbarQuote}
              />

              <ExpiryStrip
                expiryOptions={expiryOptions}
                selectedOracleId={market.oracleId}
              />

              <ChartPanel
                assetName={market.assetName}
                assetSymbol={market.assetSymbol}
                oracleId={market.oracleId}
                points={market.priceHistory}
                selectedStrikePriceUsd={selectedStrikePriceUsd}
              />
            </Card>
          </div>

          <div className="h-[30rem] min-w-0">
            <Trades
              redemptions={redemptionActivityRows}
              trades={tradeActivityRows}
            />
          </div>

          <ActivityTabs
            market={market}
            onAddPosition={(intent) => {
              setTradeIntent((currentIntent) => ({
                ...intent,
                intentId: (currentIntent?.intentId ?? 0) + 1,
              }))
            }}
            redemptions={redemptionActivityRows}
            trades={tradeActivityRows}
          />
        </section>

        <aside className="h-full min-w-0">
          <OrderTicket
            initialSide={initialSide}
            market={market}
            selectedStrikePriceUsd={selectedStrikePriceUsd}
            tradeIntent={tradeIntent}
          />
        </aside>
      </div>
    </main>
  )
}
