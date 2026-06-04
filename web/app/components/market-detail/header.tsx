import { BadgeTone } from "~/components/primitives/badge"
import { DetailHeader } from "~/components/shared/detail/detail-header"
import { formatUsd } from "~/lib/callit/format"
import { type MarketSnapshot } from "~/lib/callit/market/types"
import { type ToolbarQuote } from "~/lib/callit/trade/types"
import { formatUnitPrice } from "~/lib/callit/trading/amounts"
import { PREDICT_QUOTE_DECIMALS } from "~/lib/deepbook/config"

import { formatExpiryDistance, formatMarketTitleExpiry } from "./utils"

export interface HeaderProps {
  market: MarketSnapshot
  selectedStrikePriceUsd: number
  toolbarQuote: ToolbarQuote | null
}

const TOOLBAR_QUOTE_QUANTITY = 10n ** BigInt(PREDICT_QUOTE_DECIMALS)

function formatToolbarPrice(value: number | undefined) {
  return value === undefined
    ? "--"
    : formatUnitPrice(BigInt(value), TOOLBAR_QUOTE_QUANTITY)
}

function getStatusLabel(status: string) {
  return status === "active" ? "Live" : status
}

function getStatusTone(status: string) {
  return status === "active" ? BadgeTone.Live : BadgeTone.Neutral
}

export function Header({
  market,
  selectedStrikePriceUsd,
  toolbarQuote,
}: HeaderProps) {
  const quoteValue = formatToolbarPrice(toolbarQuote?.aboveAsk)
  const spreadValue = formatToolbarPrice(toolbarQuote?.spread)

  return (
    <DetailHeader
      assetIconUrl={market.assetIconUrl}
      assetName={market.assetName}
      assetSymbol={market.assetSymbol}
      badgeLabel={getStatusLabel(market.status)}
      badgeTone={getStatusTone(market.status)}
      metrics={[
        { label: "Price (Up)", value: quoteValue },
        { label: "Spread", value: spreadValue },
        { label: "Spot", value: formatUsd(market.currentPriceUsd, 0) },
        {
          label: "Selected Strike",
          value: formatUsd(selectedStrikePriceUsd, 0),
        },
        { label: "Expires", value: formatExpiryDistance(market.expiryMs) },
      ]}
      title={`${market.assetSymbol} Prediction · ${formatMarketTitleExpiry(market.expiryMs)}`}
    />
  )
}
