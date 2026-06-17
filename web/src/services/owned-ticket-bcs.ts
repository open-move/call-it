import { bcs } from "@mysten/sui/bcs"

import { PREDICT_PRICE_SCALE } from "@/lib/config"

export const SuiIdBcs = bcs
  .struct("ID", {
    bytes: bcs.Address,
  })
  .transform({
    output: (value) => value.bytes,
  })

export const SuiUidBcs = bcs.struct("UID", {
  id: SuiIdBcs,
})

export const BalanceBcs = bcs.struct("Balance", {
  value: bcs.U64,
})

export const MarketKeyBcs = bcs.struct("MarketKey", {
  oracle_id: SuiIdBcs,
  expiry: bcs.U64,
  strike: bcs.U64,
  direction: bcs.U8,
})

export const RangeKeyBcs = bcs.struct("RangeKey", {
  oracle_id: SuiIdBcs,
  expiry: bcs.U64,
  lower_strike: bcs.U64,
  higher_strike: bcs.U64,
})

export interface MarketKeyRow {
  expiryMs: number
  isUp: boolean
  oracleId: string
  strike: bigint
  strikeUsd: number
}

export interface RangeKeyRow {
  expiryMs: number
  higherStrike: bigint
  higherStrikeUsd: number
  lowerStrike: bigint
  lowerStrikeUsd: number
  oracleId: string
}

export type OwnedTicketClaimStatus = "active" | "claimable"

export function readBcsBigInt(value: string) {
  return BigInt(value)
}

export function readBcsNumber(value: string) {
  return Number(readBcsBigInt(value))
}

export function toUsdPrice(value: bigint) {
  return Number(value) / PREDICT_PRICE_SCALE
}

export function normalizeMarketKey(key: {
  direction: number
  expiry: string
  oracle_id: string
  strike: string
}): MarketKeyRow {
  const strike = readBcsBigInt(key.strike)

  return {
    expiryMs: readBcsNumber(key.expiry),
    isUp: key.direction === 0,
    oracleId: key.oracle_id,
    strike,
    strikeUsd: toUsdPrice(strike),
  }
}

export function normalizeRangeKey(key: {
  expiry: string
  higher_strike: string
  lower_strike: string
  oracle_id: string
}): RangeKeyRow {
  const lowerStrike = readBcsBigInt(key.lower_strike)
  const higherStrike = readBcsBigInt(key.higher_strike)

  return {
    expiryMs: readBcsNumber(key.expiry),
    higherStrike,
    higherStrikeUsd: toUsdPrice(higherStrike),
    lowerStrike,
    lowerStrikeUsd: toUsdPrice(lowerStrike),
    oracleId: key.oracle_id,
  }
}

export function getOwnedTicketClaimStatus(
  oracleStatus: string | undefined
): OwnedTicketClaimStatus {
  return oracleStatus === "settled" ? "claimable" : "active"
}
