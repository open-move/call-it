import { describe, expect, test } from "bun:test"

import type { PredictConfig } from "./config.ts"
import { selectRoundOracleFrom, type OracleInfo } from "./predict.ts"

const MIN = 75 * 60_000
const MAX = 90 * 60_000
const INTERVAL = 2 * 60 * 60_000
const TOLERANCE = 5 * 60_000

const config: PredictConfig = {
  clockObjectId: "0x6",
  packageId: "0xpredict",
  quoteAsset: "0xq::dusdc::DUSDC",
  roundEntryMaxMsToExpiry: MAX,
  roundEntryMinMsToExpiry: MIN,
  roundIntervalMs: INTERVAL,
  roundIntervalToleranceMs: TOLERANCE,
  roundUnderlyingAsset: "BTC",
  serverUrl: "https://example",
  sharedObjectId: "0xshared",
}

function oracle(overrides: Partial<OracleInfo>): OracleInfo {
  return {
    activatedAt: null,
    expiryMs: 0n,
    minStrike: 0n,
    oracleCapId: "0xcap",
    oracleId: "0xoracle",
    predictId: "0xpredict",
    settlementPrice: null,
    settledAt: null,
    status: "active",
    tickSize: 1n,
    underlyingAsset: "BTC",
    ...overrides,
  }
}

describe("selectRoundOracleFrom", () => {
  test("prefers a strict round candidate (interval within tolerance)", () => {
    const strict = oracle({
      oracleId: "0xstrict",
      expiryMs: BigInt(80 * 60_000), // within [MIN, MAX]
      activatedAt: 80 * 60_000 - INTERVAL, // expiry - activatedAt == INTERVAL exactly
    })
    const baseOnly = oracle({ oracleId: "0xbase", expiryMs: BigInt(85 * 60_000), activatedAt: null })

    const selection = selectRoundOracleFrom([baseOnly, strict], 0, config)

    expect(selection.fallback).toBe(false)
    expect(selection.oracle?.oracleId).toBe("0xstrict")
  })

  test("falls back to base candidates and breaks ties by earliest expiry", () => {
    // Neither is strict (activatedAt null); both equidistant from the entry midpoint.
    const earlier = oracle({ oracleId: "0xearlier", expiryMs: BigInt(80 * 60_000) })
    const later = oracle({ oracleId: "0xlater", expiryMs: BigInt(85 * 60_000) })

    const selection = selectRoundOracleFrom([later, earlier], 0, config)

    expect(selection.fallback).toBe(true)
    expect(selection.oracle?.oracleId).toBe("0xearlier")
  })

  test("excludes wrong underlying, inactive, and out-of-window oracles", () => {
    const wrongAsset = oracle({ oracleId: "0xeth", underlyingAsset: "ETH", expiryMs: BigInt(80 * 60_000) })
    const inactive = oracle({ oracleId: "0xsettled", status: "settled", expiryMs: BigInt(80 * 60_000) })
    const tooFar = oracle({ oracleId: "0xfar", expiryMs: BigInt(200 * 60_000) })

    const selection = selectRoundOracleFrom([wrongAsset, inactive, tooFar], 0, config)

    expect(selection.oracle).toBeUndefined()
  })
})
