import { describe, expect, test } from "bun:test"
import { bcs } from "@mysten/sui/bcs"

import { annualizedReturn } from "../src/domains/performance.ts"
import { applyStrategyFold, parseStrategyPerformanceEvent } from "../src/domains/strategy-performance.ts"
import type {
  StrategyFoldState,
  StrategyPerformanceEvent,
  StrategyPipelineKind,
} from "../src/domains/strategy-performance.ts"
import type { CheckpointEvent, EventMeta } from "../src/sui/checkpoint.ts"

describe("annualizedReturn", () => {
  test("annualizes share-price growth over the selected window", () => {
    const start = Date.UTC(2026, 0, 1)
    const result = annualizedReturn([
      { share_price: 1, timestamp_ms: start },
      { share_price: 1.01, timestamp_ms: start + 30 * 24 * 60 * 60 * 1000 },
    ])

    expect(result?.windowDays).toBe(30)
    expect(result?.apr).toBeCloseTo(0.121666, 5)
    expect(result?.apy).toBeCloseTo(0.128695, 5)
  })

  test("returns null for insufficient or invalid data", () => {
    expect(annualizedReturn([])).toBeNull()
    expect(annualizedReturn([{ share_price: 1, timestamp_ms: 1 }])).toBeNull()
    expect(
      annualizedReturn([
        { share_price: 0, timestamp_ms: 1 },
        { share_price: 1, timestamp_ms: 2 },
      ])
    ).toBeNull()
  })
})

describe("applyStrategyFold", () => {
  test("emits pre-mint snapshots and increases supply on deposits", () => {
    const result = applyStrategyFold(emptyState(), {
      kind: "deposit",
      navBefore: 0n,
      sharesMinted: 1_000n,
      strategyId: "0xstrategy",
    })

    expect(result.snapshot).toEqual({ kind: "deposit", nav: 0n, sharePrice: 1, totalShares: 0n })
    expect(result.state).toEqual({ lastRound: null, supply: 1_000n })
  })

  test("folds queued deposits at the pre-mint price", () => {
    const result = applyStrategyFold({ lastRound: null, supply: 1_000n }, {
      kind: "fold",
      navBefore: 1_100n,
      round: 3,
      sharesMinted: 100n,
      strategyId: "0xstrategy",
    })

    expect(result.snapshot).toEqual({ kind: "fold", nav: 1_100n, sharePrice: 1.1, totalShares: 1_000n })
    expect(result.state).toEqual({ lastRound: 3, supply: 1_100n })
  })

  test("settlement snapshots use post-burn supply", () => {
    const result = applyStrategyFold({ lastRound: 3, supply: 1_100n }, {
      kind: "settle",
      navAfterSettle: 1_200n,
      round: 4,
      sharesBurned: 100n,
      strategyId: "0xstrategy",
    })

    expect(result.snapshot).toEqual({ kind: "settle", nav: 1_200n, sharePrice: 1.2, totalShares: 1_000n })
    expect(result.state).toEqual({ lastRound: 4, supply: 1_000n })
  })

  test("withdrawals burn after the pre-burn snapshot and sweeps only reissue supply", () => {
    const withdraw = applyStrategyFold({ lastRound: 4, supply: 1_000n }, {
      kind: "withdraw",
      navBefore: 1_200n,
      sharesBurned: 200n,
      strategyId: "0xstrategy",
    })
    const sweepEvent: StrategyPerformanceEvent = {
      kind: "sweep",
      sharesReissued: 50n,
      strategyId: "0xstrategy",
    }
    const sweep = applyStrategyFold(withdraw.state, sweepEvent)

    expect(withdraw.snapshot).toEqual({ kind: "withdraw", nav: 1_200n, sharePrice: 1.2, totalShares: 1_000n })
    expect(withdraw.state).toEqual({ lastRound: 4, supply: 800n })
    expect(sweep.snapshot).toBeNull()
    expect(sweep.state).toEqual({ lastRound: 4, supply: 850n })
  })
})

describe("parseStrategyPerformanceEvent RoundSettled BCS", () => {
  test("decodes each deployed strategy layout by strategy kind", () => {
    const cases: Array<{ bytes: Uint8Array; kind: StrategyPipelineKind }> = [
      { bytes: hedgedPlpRoundSettledBytes(), kind: "hedged-plp" },
      { bytes: plpCollarRoundSettledBytes(), kind: "plp-collar" },
      { bytes: standardRoundSettledBytes(), kind: "strangle" },
      { bytes: standardRoundSettledBytes(), kind: "bullish-upside" },
      { bytes: rangeLadderRoundSettledBytes(), kind: "range-ladder" },
    ]

    for (const entry of cases) {
      expect(parseStrategyPerformanceEvent(roundSettledEvent(entry.bytes), entry.kind)).toEqual({
        kind: "settle",
        navAfterSettle: 2_000n,
        round: 7,
        sharesBurned: 50n,
        strategyId: address(1),
      })
    }
  })
})

function emptyState(): StrategyFoldState {
  return { lastRound: null, supply: 0n }
}

function roundSettledEvent(contents: Uint8Array): CheckpointEvent {
  return {
    contents,
    json: null,
    meta: {
      ...meta,
      eventType: "0xpackage::strategy::RoundSettled",
      module: "strategy",
    },
  }
}

function address(value: number): string {
  return `0x${value.toString(16).padStart(64, "0")}`
}

function roundSettledBase() {
  return {
    strategy_id: address(1),
    predict_id: address(2),
    manager_id: address(3),
    oracle_id: address(4),
    round: "7",
  }
}

function hedgedPlpRoundSettledBytes(): Uint8Array {
  return bcs
    .struct("HedgedPlpRoundSettled", {
      strategy_id: bcs.Address,
      predict_id: bcs.Address,
      manager_id: bcs.Address,
      oracle_id: bcs.Address,
      round: bcs.u64(),
      payout_swept: bcs.u64(),
      plp_realized: bcs.u64(),
      reserved_base_shares: bcs.u64(),
      shares_burned: bcs.u64(),
      nav_after_settle: bcs.u64(),
    })
    .serialize({
      ...roundSettledBase(),
      payout_swept: "100",
      plp_realized: "120",
      reserved_base_shares: "20",
      shares_burned: "50",
      nav_after_settle: "2000",
    })
    .toBytes()
}

function plpCollarRoundSettledBytes(): Uint8Array {
  return bcs
    .struct("PlpCollarRoundSettled", {
      strategy_id: bcs.Address,
      predict_id: bcs.Address,
      manager_id: bcs.Address,
      oracle_id: bcs.Address,
      round: bcs.u64(),
      manager_balance_swept: bcs.u64(),
      plp_realized: bcs.u64(),
      reserved_base_shares: bcs.u64(),
      shares_burned: bcs.u64(),
      nav_after_settle: bcs.u64(),
    })
    .serialize({
      ...roundSettledBase(),
      manager_balance_swept: "100",
      plp_realized: "120",
      reserved_base_shares: "20",
      shares_burned: "50",
      nav_after_settle: "2000",
    })
    .toBytes()
}

function standardRoundSettledBytes(): Uint8Array {
  return bcs
    .struct("StandardRoundSettled", {
      strategy_id: bcs.Address,
      predict_id: bcs.Address,
      manager_id: bcs.Address,
      oracle_id: bcs.Address,
      round: bcs.u64(),
      manager_balance_swept: bcs.u64(),
      reserved_base_shares: bcs.u64(),
      shares_burned: bcs.u64(),
      nav_after_settle: bcs.u64(),
    })
    .serialize({
      ...roundSettledBase(),
      manager_balance_swept: "100",
      reserved_base_shares: "20",
      shares_burned: "50",
      nav_after_settle: "2000",
    })
    .toBytes()
}

function rangeLadderRoundSettledBytes(): Uint8Array {
  return bcs
    .struct("RangeLadderRoundSettled", {
      strategy_id: bcs.Address,
      predict_id: bcs.Address,
      manager_id: bcs.Address,
      oracle_id: bcs.Address,
      round: bcs.u64(),
      payout_swept: bcs.u64(),
      reserved_base_shares: bcs.u64(),
      shares_burned: bcs.u64(),
      nav_after_settle: bcs.u64(),
    })
    .serialize({
      ...roundSettledBase(),
      payout_swept: "100",
      reserved_base_shares: "20",
      shares_burned: "50",
      nav_after_settle: "2000",
    })
    .toBytes()
}

const meta: EventMeta = {
  checkpoint: 1,
  checkpointTimestampMs: 1,
  digest: "digest",
  eventId: "digest:0",
  eventIndex: 0,
  eventType: "0xpackage::strategy::RoundSettled",
  module: "strategy",
  packageId: "0xpackage",
  sender: address(9),
  txIndex: 0,
}
