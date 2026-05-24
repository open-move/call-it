import type { Route } from "./+types/home"
import { AppFrame } from "~/components/app-frame/app-frame"
import { CryptoMarketGrid } from "~/components/simple-markets/crypto-market-grid"
import { mapOracleStateToPredictionMarket } from "~/lib/callit/live-market-mapper"
import {
  getOracleState,
  getPredictOracles,
} from "~/lib/deepbook/predict-client"

export async function loader() {
  const oracles = await getPredictOracles()
  const activeOracles = oracles
    .filter((oracle) => oracle.status === "active")
    .sort(
      (firstOracle, secondOracle) => firstOracle.expiry - secondOracle.expiry
    )
  const oracleStates = await Promise.all(
    activeOracles.map((oracle) => getOracleState(oracle.oracle_id))
  )

  return {
    markets: oracleStates.map((state) =>
      mapOracleStateToPredictionMarket(state)
    ),
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <AppFrame>
      <CryptoMarketGrid markets={loaderData.markets} />
    </AppFrame>
  )
}
