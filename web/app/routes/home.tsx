import { AppFrame } from "~/components/app-frame/app-frame"
import { CryptoMarketGrid } from "~/components/simple-markets/crypto-market-grid"
import { cryptoPredictionMarkets } from "~/lib/callit/market-data"

export default function Home() {
  return (
    <AppFrame>
      <CryptoMarketGrid markets={cryptoPredictionMarkets} />
    </AppFrame>
  )
}
