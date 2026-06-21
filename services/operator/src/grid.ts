// Pure strike-grid and sizing math shared by the strategies. No I/O, no SDK
// types — everything here is deterministic and unit-tested.

export interface StrikeGrid {
  minStrike: bigint
  tickSize: bigint
}

export interface RungPlan {
  higherStrike: bigint
  lowerStrike: bigint
  quantity: bigint
}

export interface RungParams {
  quantityBpsOfNav: number
  rungCount: number
  rungWidthBps: number
}

/// Basis-point fraction of an amount, floored.
export function bpsAmount(amount: bigint, bps: number): bigint {
  return (amount * BigInt(Math.trunc(bps))) / 10_000n
}

/// Largest grid point <= value (clamped to the grid minimum).
export function floorToGrid(value: bigint, min: bigint, tick: bigint): bigint {
  if (tick <= 0n) {
    throw new Error("oracle tick size must be positive")
  }
  if (value <= min) {
    return min
  }
  return min + ((value - min) / tick) * tick
}

/// Smallest grid point >= value.
export function ceilToGrid(value: bigint, min: bigint, tick: bigint): bigint {
  const floored = floorToGrid(value, min, tick)
  return floored === value ? floored : floored + tick
}

/// Pick a downside (strictly below spot) strike on the oracle grid, targeting
/// `strikeSpotBps` of spot.
export function chooseDownsideStrike(grid: StrikeGrid, spot: bigint, strikeSpotBps: number): bigint {
  const targetStrike = (spot * BigInt(Math.trunc(strikeSpotBps))) / 10_000n
  let strike = floorToGrid(targetStrike, grid.minStrike, grid.tickSize)

  if (strike >= spot) {
    if (strike <= grid.minStrike) {
      throw new Error("no downside strike available on oracle grid")
    }
    strike -= grid.tickSize
  }

  if (strike <= 0n || strike < grid.minStrike) {
    throw new Error("computed strike is outside oracle grid")
  }

  return strike
}

/// Build symmetric range rungs around spot. Each rung `i` widens by
/// `rungWidthBps * i`; total quantity is split evenly across rungs.
export function planRungs(grid: StrikeGrid, spot: bigint, nav: bigint, params: RungParams): RungPlan[] {
  const rungCount = Math.trunc(params.rungCount)
  if (rungCount <= 0) {
    throw new Error("rung count must be positive")
  }

  const totalQuantity = bpsAmount(nav, params.quantityBpsOfNav)
  const quantity = totalQuantity / BigInt(rungCount)
  if (quantity <= 0n) {
    throw new Error("computed range rung quantity is zero")
  }

  const rungs: RungPlan[] = []
  for (let index = 1; index <= rungCount; index += 1) {
    const widthBps = BigInt(Math.trunc(params.rungWidthBps * index))
    const lowerTarget = spot - (spot * widthBps) / 10_000n
    const higherTarget = spot + (spot * widthBps) / 10_000n
    const lowerStrike = floorToGrid(lowerTarget, grid.minStrike, grid.tickSize)
    const higherStrike = ceilToGrid(higherTarget, grid.minStrike, grid.tickSize)

    if (lowerStrike >= higherStrike) {
      throw new Error("computed invalid range rung")
    }

    rungs.push({ higherStrike, lowerStrike, quantity })
  }

  return rungs
}
