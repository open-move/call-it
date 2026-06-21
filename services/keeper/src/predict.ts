import { z } from "zod"

import type { PositionState } from "./db/database.ts"

export interface MarketPositionFields {
  expiry: bigint
  isUp: boolean
  managerId: string
  oracleId: string
  quoteAsset: string
  strike: bigint
}

export interface PositionMintedEvent extends MarketPositionFields {
  askPrice: bigint
  cost: bigint
  predictId: string
  quantity: bigint
  trader: string
}

export interface PositionRedeemedEvent extends MarketPositionFields {
  bidPrice: bigint
  executor: string
  isSettled: boolean
  owner: string
  payout: bigint
  predictId: string
  quantity: bigint
}

export interface OracleSettledEvent {
  expiry: bigint
  oracleId: string
  settlementPrice: bigint
  timestamp: bigint
}

export type ParsedPredictEvent =
  | { kind: "OracleSettled"; value: OracleSettledEvent }
  | { kind: "PositionMinted"; value: PositionMintedEvent }
  | { kind: "PositionRedeemed"; value: PositionRedeemedEvent }

export interface RawPredictEventInput {
  eventType: string
  json: unknown
}

const u64Schema = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()])
  .transform((value) => BigInt(value))

const idSchema = z
  .union([
    z.string(),
    z.object({ bytes: z.string() }).transform((value) => value.bytes),
    z.object({ id: z.string() }).transform((value) => value.id),
  ])
  .transform((value) => value.toLowerCase())

const addressSchema = z.string()

const typeNameSchema = z
  .union([z.string(), z.object({ name: z.string() }).transform((value) => value.name)])
  .transform((value) => value.toString())

const positionMintedSchema = z
  .object({
    ask_price: u64Schema,
    cost: u64Schema,
    expiry: u64Schema,
    is_up: z.boolean(),
    manager_id: idSchema,
    oracle_id: idSchema,
    predict_id: idSchema,
    quantity: u64Schema,
    quote_asset: typeNameSchema,
    strike: u64Schema,
    trader: addressSchema,
  })
  .transform(
    (event): PositionMintedEvent => ({
      askPrice: event.ask_price,
      cost: event.cost,
      expiry: event.expiry,
      isUp: event.is_up,
      managerId: event.manager_id,
      oracleId: event.oracle_id,
      predictId: event.predict_id,
      quantity: event.quantity,
      quoteAsset: event.quote_asset,
      strike: event.strike,
      trader: event.trader,
    })
  )

const positionRedeemedSchema = z
  .object({
    bid_price: u64Schema,
    executor: addressSchema,
    expiry: u64Schema,
    is_settled: z.boolean(),
    is_up: z.boolean(),
    manager_id: idSchema,
    oracle_id: idSchema,
    owner: addressSchema,
    payout: u64Schema,
    predict_id: idSchema,
    quantity: u64Schema,
    quote_asset: typeNameSchema,
    strike: u64Schema,
  })
  .transform(
    (event): PositionRedeemedEvent => ({
      bidPrice: event.bid_price,
      executor: event.executor,
      expiry: event.expiry,
      isSettled: event.is_settled,
      isUp: event.is_up,
      managerId: event.manager_id,
      oracleId: event.oracle_id,
      owner: event.owner,
      payout: event.payout,
      predictId: event.predict_id,
      quantity: event.quantity,
      quoteAsset: event.quote_asset,
      strike: event.strike,
    })
  )

const oracleSettledSchema = z
  .object({
    expiry: u64Schema,
    oracle_id: idSchema,
    settlement_price: u64Schema,
    timestamp: u64Schema,
  })
  .transform(
    (event): OracleSettledEvent => ({
      expiry: event.expiry,
      oracleId: event.oracle_id,
      settlementPrice: event.settlement_price,
      timestamp: event.timestamp,
    })
  )

export function isPredictEventType(eventType: string, predictPackageId: string) {
  const normalizedType = eventType.toLowerCase()
  const normalizedPackage = predictPackageId.toLowerCase()
  return (
    normalizedType.startsWith(`${normalizedPackage}::predict::PositionMinted`.toLowerCase()) ||
    normalizedType.startsWith(`${normalizedPackage}::predict::PositionRedeemed`.toLowerCase()) ||
    normalizedType.startsWith(`${normalizedPackage}::oracle::OracleSettled`.toLowerCase())
  )
}

export function parsePredictEvent(input: RawPredictEventInput): ParsedPredictEvent | null {
  if (input.eventType.includes("::predict::PositionMinted")) {
    return { kind: "PositionMinted", value: positionMintedSchema.parse(input.json) }
  }

  if (input.eventType.includes("::predict::PositionRedeemed")) {
    return { kind: "PositionRedeemed", value: positionRedeemedSchema.parse(input.json) }
  }

  if (input.eventType.includes("::oracle::OracleSettled")) {
    return { kind: "OracleSettled", value: oracleSettledSchema.parse(input.json) }
  }

  return null
}

export function positionKey(fields: MarketPositionFields) {
  return [
    fields.managerId.toLowerCase(),
    fields.quoteAsset,
    fields.oracleId.toLowerCase(),
    fields.expiry.toString(),
    fields.strike.toString(),
    fields.isUp ? "up" : "down",
  ].join("|")
}

export function expectedSettledPayout(position: PositionState) {
  if (!position.settled || position.settlementPrice === null || position.openQty === 0n) {
    return 0n
  }

  const upWins = position.settlementPrice > position.strike
  const positionWins = position.isUp ? upWins : !upWins
  return positionWins ? position.openQty : 0n
}
