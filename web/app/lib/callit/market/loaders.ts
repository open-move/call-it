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
  const oracleData = await Promise.all(
    activeOracles.map(async (oracle) => {
      const [state, prices] = await Promise.all([
        getOracleState(oracle.oracle_id),
        getOraclePrices(oracle.oracle_id, 48),
      ])

      return { prices, state }
    })
  )

  return oracleData.map(({ prices, state }) =>
    mapOracleStateToMarketSnapshot(state, prices)
  )
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
