import { useEffect, useState } from "react"

import type { ExpiryOption, MarketSnapshot } from "@/lib/types/market"
import type {
  PositionTradeIntent,
  RangeRedemption,
  RangeTrade,
  Redemption,
  Trade,
  TradeMarket,
} from "@/lib/types/trade"
import { Card } from "@/components/ui/card"
import {
  getRedemptionActivityRows,
  getTradeActivityRows,
} from "@/lib/trade-activity"

import { ActivityTabs } from "./activity-tabs"
import { ChartPanel } from "./chart-panel"
import { ExpiryStrip } from "./expiry-strip"
import { Header } from "./header"
import { OrderTicket } from "./order-ticket"
import { Trades } from "./trades"

export interface PageProps {
  expiryOptions: ExpiryOption[]
  initialSide?: "above" | "below"
  market: MarketSnapshot
  marketOptions: TradeMarket[]
  rangeRedemptions: RangeRedemption[]
  rangeTrades: RangeTrade[]
  redemptions: Redemption[]
  selectedStrikePriceUsd: number
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
  trades,
}: PageProps) {
  const [tradeIntent, setTradeIntent] = useState<PositionTradeIntent>()
  const [activeStrikePriceUsd, setActiveStrikePriceUsd] = useState(
    selectedStrikePriceUsd
  )
  const tradeActivityRows = getTradeActivityRows(trades, rangeTrades)
  const redemptionActivityRows = getRedemptionActivityRows(
    redemptions,
    rangeRedemptions
  )

  useEffect(() => {
    setActiveStrikePriceUsd(selectedStrikePriceUsd)
  }, [market.oracleId, selectedStrikePriceUsd])

  return (
    <main className="mx-auto w-full max-w-384 px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,7fr)_minmax(0,2.5fr)] xl:items-stretch">
          <div className="h-[28rem] min-w-0 xl:h-[min(34rem,calc(100vh-9rem))]">
            <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
              <Header
                market={market}
                marketOptions={marketOptions}
                selectedStrikePriceUsd={activeStrikePriceUsd}
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
                selectedStrikePriceUsd={activeStrikePriceUsd}
              />
            </Card>
          </div>

          <div className="h-[22rem] min-w-0 xl:h-[min(34rem,calc(100vh-9rem))]">
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

        <aside className="h-full min-w-0 xl:sticky xl:top-[4.25rem] xl:self-start">
          <OrderTicket
            initialSide={initialSide}
            market={market}
            onStrikeChange={setActiveStrikePriceUsd}
            selectedStrikePriceUsd={activeStrikePriceUsd}
            tradeIntent={tradeIntent}
          />
        </aside>
      </div>
    </main>
  )
}
