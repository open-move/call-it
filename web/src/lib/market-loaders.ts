import {
  getOraclePrices,
  getOracleState,
  getPredictOracles,
} from "@/services/predict-client"
import type {MarketSnapshot} from "@/lib/types/market";

import { mapOracleStateToMarketSnapshot } from "./market-mapper"

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

// Recently-resolved markets, newest first. Bounded because each oracle costs a
// state + price-history fetch; the markets surface only needs a recent window.
const EXPIRED_MARKET_LIMIT = 10

export async function loadExpiredMarketSnapshots(
  limit = EXPIRED_MARKET_LIMIT
): Promise<MarketSnapshot[]> {
  const oracles = await getPredictOracles()
  const expiredOracles = oracles
    .filter((oracle) => oracle.status === "settled")
    .sort(
      (firstOracle, secondOracle) => secondOracle.expiry - firstOracle.expiry
    )
    .slice(0, limit)
  const oracleData = await Promise.all(
    expiredOracles.map(async (oracle) => {
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
