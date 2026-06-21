import { describe, expect, test } from "bun:test"

import { bpsAmount, ceilToGrid, chooseDownsideStrike, floorToGrid, planRungs } from "./grid.ts"

describe("bpsAmount", () => {
  test("takes a basis-point fraction, floored", () => {
    expect(bpsAmount(10_000n, 250)).toBe(250n)
    expect(bpsAmount(1_000_000n, 9_900)).toBe(990_000n)
    expect(bpsAmount(3n, 1)).toBe(0n) // 3 * 1 / 10000 floors to 0
  })
})

describe("floorToGrid", () => {
  test("clamps to min and floors to the tick grid", () => {
    expect(floorToGrid(5n, 10n, 10n)).toBe(10n) // below min
    expect(floorToGrid(100n, 0n, 10n)).toBe(100n) // on grid
    expect(floorToGrid(99n, 0n, 10n)).toBe(90n) // between
    expect(floorToGrid(95n, 50n, 10n)).toBe(90n) // offset grid
  })

  test("rejects non-positive tick", () => {
    expect(() => floorToGrid(100n, 0n, 0n)).toThrow("tick size must be positive")
  })
})

describe("ceilToGrid", () => {
  test("returns the value when on grid, else the next tick up", () => {
    expect(ceilToGrid(100n, 0n, 10n)).toBe(100n)
    expect(ceilToGrid(101n, 0n, 10n)).toBe(110n)
  })
})

describe("chooseDownsideStrike", () => {
  const grid = { minStrike: 0n, tickSize: 10n }

  test("targets strikeSpotBps of spot, floored to grid", () => {
    expect(chooseDownsideStrike(grid, 100n, 9_900)).toBe(90n)
  })

  test("steps strictly below spot when the target lands on/above spot", () => {
    // 100% of spot floors to 100 which is == spot, so it steps down one tick
    expect(chooseDownsideStrike(grid, 100n, 10_000)).toBe(90n)
  })

  test("throws when no downside strike fits on the grid", () => {
    expect(() => chooseDownsideStrike({ minStrike: 100n, tickSize: 10n }, 100n, 10_000)).toThrow(
      "no downside strike available"
    )
  })
})

describe("planRungs", () => {
  const grid = { minStrike: 0n, tickSize: 10n }

  test("splits quantity evenly and widens each rung", () => {
    const rungs = planRungs(grid, 1_000n, 1_000_000n, {
      quantityBpsOfNav: 250,
      rungCount: 2,
      rungWidthBps: 25,
    })

    expect(rungs).toHaveLength(2)
    // total = 1_000_000 * 250 / 10_000 = 25_000; split across 2 rungs
    expect(rungs[0]!.quantity).toBe(12_500n)
    expect(rungs[1]!.quantity).toBe(12_500n)
    for (const rung of rungs) {
      expect(rung.lowerStrike < rung.higherStrike).toBe(true)
    }
  })

  test("rejects non-positive rung count", () => {
    expect(() =>
      planRungs(grid, 1_000n, 1_000_000n, { quantityBpsOfNav: 250, rungCount: 0, rungWidthBps: 25 })
    ).toThrow("rung count must be positive")
  })

  test("rejects a zero per-rung quantity", () => {
    expect(() =>
      planRungs(grid, 1_000n, 1n, { quantityBpsOfNav: 250, rungCount: 2, rungWidthBps: 25 })
    ).toThrow("rung quantity is zero")
  })

  test("rejects a degenerate (zero-width) rung", () => {
    expect(() =>
      planRungs(grid, 1_000n, 1_000_000n, { quantityBpsOfNav: 250, rungCount: 1, rungWidthBps: 0 })
    ).toThrow("invalid range rung")
  })
})
