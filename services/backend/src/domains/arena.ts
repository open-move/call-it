import { bcs } from "@mysten/sui/bcs"
import { z } from "zod"

import type { CheckpointEvent } from "../sui/checkpoint.ts"
import { normalizeAddress, parseEventType } from "../sui/bcs.ts"

export const ARENA_MODULE = "arena"

export type ArenaEventName =
  | "CallLaunched"
  | "CallBacked"
  | "CallFaded"
  | "CreatorBondClaimed"
  | "CreatorBondReclaimed"

export interface CallLaunchedEvent {
  arenaId: string
  bondPlpAmount: string
  callId: string
  createdAtMs: string
  creator: string
  expiry: string
  isUp: boolean
  oracleId: string
  predictId: string
  strike: string
}

export interface CallParticipationEvent {
  callId: string
  cost: string
  managerId: string
  participant: string
  quantity: string
  recordedAtMs: string
  refundAmount: string
}

export interface CreatorBondClaimedEvent {
  bondPlpAmount: string
  callId: string
  claimedAtMs: string
  oracleId: string
}

export interface CreatorBondReclaimedEvent {
  bondPlpAmount: string
  callId: string
  reclaimedAtMs: string
}

export type ParsedArenaEvent =
  | { kind: "CallLaunched"; value: CallLaunchedEvent }
  | { kind: "CallBacked"; value: CallParticipationEvent }
  | { kind: "CallFaded"; value: CallParticipationEvent }
  | { kind: "CreatorBondClaimed"; value: CreatorBondClaimedEvent }
  | { kind: "CreatorBondReclaimed"; value: CreatorBondReclaimedEvent }

// ---------------------------------------------------------------------------
// BCS struct decoders. Field ORDER must match the Move contract exactly.
// bcs.u64() yields a decimal string; bcs.Address yields a 0x-prefixed hex
// string; bcs.vector(bcs.u8()) yields number[]. Decoded values are validated
// with Zod below before being mapped to the domain shapes.
// ---------------------------------------------------------------------------

const callLaunchedStruct = bcs.struct("CallLaunched", {
  arena_id: bcs.Address,
  call_id: bcs.Address,
  creator: bcs.Address,
  predict_id: bcs.Address,
  oracle_id: bcs.Address,
  expiry: bcs.u64(),
  strike: bcs.u64(),
  is_up: bcs.bool(),
  bond_plp_amount: bcs.u64(),
  created_at_ms: bcs.u64(),
})

const callParticipationStruct = bcs.struct("CallParticipation", {
  call_id: bcs.Address,
  participant: bcs.Address,
  manager_id: bcs.Address,
  cost: bcs.u64(),
  refund_amount: bcs.u64(),
  quantity: bcs.u64(),
  recorded_at_ms: bcs.u64(),
})

const creatorBondClaimedStruct = bcs.struct("CreatorBondClaimed", {
  call_id: bcs.Address,
  oracle_id: bcs.Address,
  bond_plp_amount: bcs.u64(),
  claimed_at_ms: bcs.u64(),
})

const creatorBondReclaimedStruct = bcs.struct("CreatorBondReclaimed", {
  call_id: bcs.Address,
  bond_plp_amount: bcs.u64(),
  reclaimed_at_ms: bcs.u64(),
})

// ---------------------------------------------------------------------------
// Zod validation of decoded shapes. u64 fields accept the string from BCS or
// the string/number from the protobuf-json fallback. Addresses accept a string.
// ---------------------------------------------------------------------------

const u64Schema = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
  .transform((value) => value.toString())

const addressSchema = z.string().transform((value) => normalizeAddress(value))

const boolSchema = z.boolean()

const callLaunchedSchema = z
  .object({
    arena_id: addressSchema,
    bond_plp_amount: u64Schema,
    call_id: addressSchema,
    created_at_ms: u64Schema,
    creator: addressSchema,
    expiry: u64Schema,
    is_up: boolSchema,
    oracle_id: addressSchema,
    predict_id: addressSchema,
    strike: u64Schema,
  })
  .transform(
    (raw): CallLaunchedEvent => ({
      arenaId: raw.arena_id,
      bondPlpAmount: raw.bond_plp_amount,
      callId: raw.call_id,
      createdAtMs: raw.created_at_ms,
      creator: raw.creator,
      expiry: raw.expiry,
      isUp: raw.is_up,
      oracleId: raw.oracle_id,
      predictId: raw.predict_id,
      strike: raw.strike,
    })
  )

const callParticipationSchema = z
  .object({
    call_id: addressSchema,
    cost: u64Schema,
    manager_id: addressSchema,
    participant: addressSchema,
    quantity: u64Schema,
    recorded_at_ms: u64Schema,
    refund_amount: u64Schema,
  })
  .transform(
    (raw): CallParticipationEvent => ({
      callId: raw.call_id,
      cost: raw.cost,
      managerId: raw.manager_id,
      participant: raw.participant,
      quantity: raw.quantity,
      recordedAtMs: raw.recorded_at_ms,
      refundAmount: raw.refund_amount,
    })
  )

const creatorBondClaimedSchema = z
  .object({
    bond_plp_amount: u64Schema,
    call_id: addressSchema,
    claimed_at_ms: u64Schema,
    oracle_id: addressSchema,
  })
  .transform(
    (raw): CreatorBondClaimedEvent => ({
      bondPlpAmount: raw.bond_plp_amount,
      callId: raw.call_id,
      claimedAtMs: raw.claimed_at_ms,
      oracleId: raw.oracle_id,
    })
  )

const creatorBondReclaimedSchema = z
  .object({
    bond_plp_amount: u64Schema,
    call_id: addressSchema,
    reclaimed_at_ms: u64Schema,
  })
  .transform(
    (raw): CreatorBondReclaimedEvent => ({
      bondPlpAmount: raw.bond_plp_amount,
      callId: raw.call_id,
      reclaimedAtMs: raw.reclaimed_at_ms,
    })
  )

export function isArenaEventType(eventType: string): boolean {
  const { module, name } = parseEventType(eventType)
  if (module !== ARENA_MODULE) {
    return false
  }
  return (
    name === "CallLaunched" ||
    name === "CallBacked" ||
    name === "CallFaded" ||
    name === "CreatorBondClaimed" ||
    name === "CreatorBondReclaimed"
  )
}

// Decode an arena event, preferring BCS bytes. Falls back to the protobuf-json
// shape for V0 when contents are unavailable.
// TODO(V1): drop the json fallback once all checkpoints expose event.contents.
export function parseArenaEvent(event: CheckpointEvent): ParsedArenaEvent | null {
  const { name } = parseEventType(event.meta.eventType)

  switch (name) {
    case "CallLaunched":
      return {
        kind: "CallLaunched",
        value: callLaunchedSchema.parse(decode(event, callLaunchedStruct)),
      }
    case "CallBacked":
      return {
        kind: "CallBacked",
        value: callParticipationSchema.parse(decode(event, callParticipationStruct)),
      }
    case "CallFaded":
      return {
        kind: "CallFaded",
        value: callParticipationSchema.parse(decode(event, callParticipationStruct)),
      }
    case "CreatorBondClaimed":
      return {
        kind: "CreatorBondClaimed",
        value: creatorBondClaimedSchema.parse(decode(event, creatorBondClaimedStruct)),
      }
    case "CreatorBondReclaimed":
      return {
        kind: "CreatorBondReclaimed",
        value: creatorBondReclaimedSchema.parse(decode(event, creatorBondReclaimedStruct)),
      }
    default:
      return null
  }
}

function decode(event: CheckpointEvent, struct: { parse(bytes: Uint8Array): unknown }): unknown {
  if (event.contents !== null) {
    return struct.parse(event.contents)
  }
  return event.json
}
