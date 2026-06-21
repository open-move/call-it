/// Risk bounds for the CallIt Hedged PLP strategy.
///
/// A `Policy` is an immutable, validated bundle of basis-point limits that the
/// strategy consults each round when it splits a freshly redeemed NAV into a
/// downside hedge, a PLP liquidity allocation, and an idle reserve. The bounds
/// are checked once at construction (`new`), so any `Policy` value in
/// circulation is guaranteed well-formed; the strategy can then read its
/// accessors without re-validating.
module hedged_plp_strategy::policy;

/// Basis-point denominator: 10_000 bps == 100%.
const BPS_DENOMINATOR: u64 = 10_000;
/// A single round may never spend more than half of NAV on the hedge premium.
const MAX_HEDGE_BUDGET_BPS: u16 = 5_000;
/// The downside strike may sit at most this far below spot.
const MAX_STRIKE_BAND_BPS: u16 = 5_000;
/// PLP may absorb up to all of NAV (the reserve + hedge split caps it in practice).
const MAX_PLP_ALLOCATION_BPS: u16 = 10_000;
/// Hedge ask ceiling expressed as bps of hedge quantity; 10_000 == full notional.
const MAX_HEDGE_ASK_BPS: u64 = 10_000;

#[error]
const EInvalidPolicy: vector<u8> = b"Policy bounds are out of range or do not sum within 100%";

/// Validated basis-point limits governing one round's capital split.
public struct Policy has copy, drop, store {
    /// Share of NAV budgeted for the downside hedge premium.
    hedge_budget_bps: u16,
    /// Maximum distance below spot the hedge strike may be placed.
    strike_band_bps: u16,
    /// Share of NAV held idle (never deployed into hedge or PLP) each round.
    reserve_bps: u16,
    /// Cap on the share of NAV supplied as PLP liquidity.
    max_plp_allocation_bps: u16,
    /// Maximum acceptable hedge ask, in bps of hedge quantity.
    max_hedge_ask_bps: u64,
}

/// Construct a `Policy`, asserting all bounds hold; aborts with `EInvalidPolicy`
/// otherwise. Callers can treat the returned value as always well-formed.
public fun new(
    hedge_budget_bps: u16,
    strike_band_bps: u16,
    reserve_bps: u16,
    max_plp_allocation_bps: u16,
    max_hedge_ask_bps: u64,
): Policy {
    assert_valid(hedge_budget_bps, strike_band_bps, reserve_bps, max_plp_allocation_bps, max_hedge_ask_bps);
    Policy { hedge_budget_bps, strike_band_bps, reserve_bps, max_plp_allocation_bps, max_hedge_ask_bps }
}

public fun hedge_budget_bps(policy: &Policy): u16 {
    policy.hedge_budget_bps
}

public fun strike_band_bps(policy: &Policy): u16 {
    policy.strike_band_bps
}

public fun reserve_bps(policy: &Policy): u16 {
    policy.reserve_bps
}

public fun max_plp_allocation_bps(policy: &Policy): u16 {
    policy.max_plp_allocation_bps
}

public fun max_hedge_ask_bps(policy: &Policy): u64 {
    policy.max_hedge_ask_bps
}

// Enforce per-field ranges and the cross-field invariant that reserve + PLP +
// hedge can never demand more than the whole NAV (<= 100%).
fun assert_valid(
    hedge_budget_bps: u16,
    strike_band_bps: u16,
    reserve_bps: u16,
    max_plp_allocation_bps: u16,
    max_hedge_ask_bps: u64,
) {
    assert!(hedge_budget_bps > 0 && hedge_budget_bps <= MAX_HEDGE_BUDGET_BPS, EInvalidPolicy);
    assert!(strike_band_bps > 0 && strike_band_bps <= MAX_STRIKE_BAND_BPS, EInvalidPolicy);
    assert!((reserve_bps as u64) < BPS_DENOMINATOR, EInvalidPolicy);
    assert!(max_plp_allocation_bps > 0 && max_plp_allocation_bps <= MAX_PLP_ALLOCATION_BPS, EInvalidPolicy);
    assert!((reserve_bps as u64) + (max_plp_allocation_bps as u64) + (hedge_budget_bps as u64) <= BPS_DENOMINATOR, EInvalidPolicy);
    assert!(max_hedge_ask_bps > 0 && max_hedge_ask_bps <= MAX_HEDGE_ASK_BPS, EInvalidPolicy);
}
