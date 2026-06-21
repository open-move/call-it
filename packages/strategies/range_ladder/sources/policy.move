/// Policy and recorded range-position types for the managed Range Ladder strategy.
///
/// A `Policy` is the immutable-per-round risk envelope the keeper trades inside:
/// how much NAV may be spent on premium, how much must stay in reserve, the
/// worst per-range ask the keeper may accept, and how many ladder rungs a round
/// may have. A `Rung` is one requested range-leg of the ladder (strike band +
/// quantity); a `Position` is the realized record of a rung after it is minted,
/// pinning the on-chain `RangeKey`, the filled quantity, and the premium paid.
/// All limits are validated at construction so the strategy can trust them.
module range_ladder_strategy::policy;

use deepbook_predict::range_key::RangeKey;

/// Basis-point denominator: 10_000 bps == 100%.
const BPS_DENOMINATOR: u64 = 10_000;
/// Upper bound on the premium budget (100% of NAV).
const MAX_PREMIUM_BUDGET_BPS: u16 = 10_000;
/// Upper bound on the reserve fraction (100% of NAV).
const MAX_RESERVE_BPS: u16 = 10_000;
/// Upper bound on the per-range ask ceiling (ask may be up to 100% of notional).
const MAX_RANGE_ASK_BPS: u64 = 10_000;
/// Hard cap on rungs per ladder, bounding the per-round position vector.
const MAX_RUNG_COUNT_LIMIT: u64 = 16;

#[error]
const EInvalidPolicy: vector<u8> = b"Policy parameters are out of range or inconsistent";

#[error]
const EEmptyLadder: vector<u8> = b"Ladder must have at least one rung";

#[error]
const ETooManyRungs: vector<u8> = b"Ladder exceeds the policy's max rung count";

#[error]
const EInvalidRung: vector<u8> = b"Rung strikes must be ascending and quantity non-zero";

/// Per-round risk envelope. All fields are basis points of NAV except
/// `max_rung_count`. Validated by `new`; never mutated after construction.
public struct Policy has copy, drop, store {
    /// Share of NAV the keeper may move into the manager as premium per round.
    premium_budget_bps: u16,
    /// Share of NAV held back (not spent on premium) as a buffer.
    reserve_bps: u16,
    /// Worst acceptable ask per range, as bps of the range's quantity/notional.
    max_range_ask_bps: u64,
    /// Maximum number of rungs in a single round's ladder.
    max_rung_count: u64,
}

/// One requested ladder leg: buy `quantity` of the range `[lower_strike,
/// higher_strike)`. Strike ordering and non-zero quantity are enforced by
/// `new_rung` / `assert_valid_rung_terms`.
public struct Rung has copy, drop, store {
    lower_strike: u64,
    higher_strike: u64,
    quantity: u64,
}

/// Realized record of a minted rung, retained on the active round so settlement
/// can redeem exactly what was bought and detect tampering.
public struct Position has copy, drop, store {
    /// The on-chain Predict range identity (oracle, expiry, strike band).
    key: RangeKey,
    /// Range units actually held.
    quantity: u64,
    /// Premium paid to acquire `quantity` of this range.
    cost: u64,
}

/// Construct a validated policy. Aborts unless: premium budget is in
/// (0, 100%]; reserve is strictly < 100% and <= 100%; budget + reserve fit
/// within NAV (<= 100%); the ask ceiling is in (0, 100%]; and the rung count is
/// in (0, MAX_RUNG_COUNT_LIMIT].
public fun new(
    premium_budget_bps: u16,
    reserve_bps: u16,
    max_range_ask_bps: u64,
    max_rung_count: u64,
): Policy {
    assert!(premium_budget_bps > 0 && premium_budget_bps <= MAX_PREMIUM_BUDGET_BPS, EInvalidPolicy);
    assert!((reserve_bps as u64) < BPS_DENOMINATOR && reserve_bps <= MAX_RESERVE_BPS, EInvalidPolicy);
    assert!((premium_budget_bps as u64) + (reserve_bps as u64) <= BPS_DENOMINATOR, EInvalidPolicy);
    assert!(max_range_ask_bps > 0 && max_range_ask_bps <= MAX_RANGE_ASK_BPS, EInvalidPolicy);
    assert!(max_rung_count > 0 && max_rung_count <= MAX_RUNG_COUNT_LIMIT, EInvalidPolicy);
    Policy { premium_budget_bps, reserve_bps, max_range_ask_bps, max_rung_count }
}

/// Build a single validated ladder rung (caller-facing).
public fun new_rung(lower_strike: u64, higher_strike: u64, quantity: u64): Rung {
    assert_valid_rung_terms(lower_strike, higher_strike, quantity);
    Rung { lower_strike, higher_strike, quantity }
}

/// Record a realized position. Package-internal: only the strategy may mint
/// positions, after it has actually acquired the range.
public(package) fun new_position(key: RangeKey, quantity: u64, cost: u64): Position {
    Position { key, quantity, cost }
}

/// Validate a full ladder against the policy: non-empty, within the rung cap,
/// and every rung individually well-formed. Called before a round trades.
public(package) fun assert_valid_rungs(policy: &Policy, rungs: &vector<Rung>) {
    let count = rungs.length();
    assert!(count > 0, EEmptyLadder);
    assert!(count <= policy.max_rung_count, ETooManyRungs);
    count.do!(|index| {
        let rung = &rungs[index];
        assert_valid_rung_terms(rung.lower_strike, rung.higher_strike, rung.quantity);
    });
}

public fun premium_budget_bps(policy: &Policy): u16 { policy.premium_budget_bps }

public fun reserve_bps(policy: &Policy): u16 { policy.reserve_bps }

public fun max_range_ask_bps(policy: &Policy): u64 { policy.max_range_ask_bps }

public fun max_rung_count(policy: &Policy): u64 { policy.max_rung_count }

public fun lower_strike(rung: &Rung): u64 { rung.lower_strike }

public fun higher_strike(rung: &Rung): u64 { rung.higher_strike }

public fun quantity(rung: &Rung): u64 { rung.quantity }

public fun position_key(position: &Position): RangeKey { position.key }

public fun position_quantity(position: &Position): u64 { position.quantity }

public fun position_cost(position: &Position): u64 { position.cost }

// A rung is well-formed iff its strike band is strictly ascending and it buys a
// non-zero quantity.
fun assert_valid_rung_terms(lower_strike: u64, higher_strike: u64, quantity: u64) {
    assert!(lower_strike < higher_strike && quantity > 0, EInvalidRung);
}
