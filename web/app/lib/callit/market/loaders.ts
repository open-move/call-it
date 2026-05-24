import { mapOracleStateToMarketSnapshot } from "~/lib/callit/market/mapper"
import { type MarketSnapshot } from "~/lib/callit/market/types"
import {
  getOraclePrices,
  getOracleState,
  getPredictOracles,
} from "~/lib/deepbook/predict-client"

export async function loadActiveMarketSnapshots(): Promise<MarketSnapshot[]> {
  const oracles = await getPredictOracles()
  const activeOracles = oracles
    .filter((oracle) => oracle.status === "active")
    .sort(
      (firstOracle, secondOracle) => firstOracle.expiry - secondOracle.expiry
    )
  const oracleStates = await Promise.all(
    activeOracles.map((oracle) => getOracleState(oracle.oracle_id))
  )

  return oracleStates.map((state) => mapOracleStateToMarketSnapshot(state))
}

export async function loadMarketSnapshot(
  oracleId: string
): Promise<MarketSnapshot> {
  const [oracleState, prices] = await Promise.all([
    getOracleState(oracleId),
    getOraclePrices(oracleId, 120),
  ])

  return mapOracleStateToMarketSnapshot(oracleState, prices)
}
