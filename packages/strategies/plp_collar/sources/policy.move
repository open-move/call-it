/// Immutable policy bounds for the managed PLP Collar strategy.
///
/// A `Policy` is a value object (copy/drop/store) that caps how each round may
/// deploy the strategy's NAV: the downside/upside hedge premium budgets, how far
/// strikes may sit from spot, the idle reserve, the maximum PLP allocation, and a
/// per-leg ask-price ceiling. `new` validates every field on construction, so a
/// constructed `Policy` is always within bounds. All percentages are basis points
/// of `BPS_DENOMINATOR` (10_000 == 100%).
module plp_collar_strategy::policy;

/// Basis-point scale: 10_000 bps == 100%.
const BPS_DENOMINATOR: u64 = 10_000;
/// Ceiling for each hedge leg's premium budget (50% of NAV).
const MAX_LEG_BUDGET_BPS: u16 = 5_000;
/// Ceiling for how far a strike may sit from spot (5% of spot).
const MAX_STRIKE_BAND_BPS: u16 = 500;
/// Ceiling for the PLP allocation (100% of NAV before other caps apply).
const MAX_PLP_ALLOCATION_BPS: u16 = 10_000;
/// Ceiling for a leg's ask cost as a fraction of its quantity (100%).
const MAX_LEG_ASK_BPS: u64 = 10_000;

#[error]
const EInvalidPolicy: vector<u8> = b"Policy parameters are out of bounds or do not sum within 100%";

/// Validated allocation bounds applied to every round.
public struct Policy has copy, drop, store {
    /// Premium budget for the downside hedge leg, in bps of NAV.
    downside_budget_bps: u16,
    /// Premium budget for the upside hedge leg, in bps of NAV.
    upside_budget_bps: u16,
    /// Maximum distance a strike may sit from spot, in bps of spot.
    strike_band_bps: u16,
    /// Idle reserve kept out of PLP, in bps of NAV.
    reserve_bps: u16,
    /// Maximum capital allocated to PLP, in bps of NAV.
    max_plp_allocation_bps: u16,
    /// Per-leg ask-cost ceiling, in bps of the leg quantity.
    max_leg_ask_bps: u64,
}

/// Construct a `Policy`, asserting every bound: each leg budget is in
/// `(0, MAX_LEG_BUDGET_BPS]`, the strike band is in `(0, MAX_STRIKE_BAND_BPS]`,
/// the reserve is below 100%, the PLP cap is in `(0, MAX_PLP_ALLOCATION_BPS]`, the
/// budgets + reserve + PLP cap together do not exceed 100% of NAV, and the leg-ask
/// ceiling is in `(0, MAX_LEG_ASK_BPS]`.
public fun new(
    downside_budget_bps: u16,
    upside_budget_bps: u16,
    strike_band_bps: u16,
    reserve_bps: u16,
    max_plp_allocation_bps: u16,
    max_leg_ask_bps: u64,
): Policy {
    assert!(downside_budget_bps > 0 && downside_budget_bps <= MAX_LEG_BUDGET_BPS, EInvalidPolicy);
    assert!(upside_budget_bps > 0 && upside_budget_bps <= MAX_LEG_BUDGET_BPS, EInvalidPolicy);
    assert!(strike_band_bps > 0 && strike_band_bps <= MAX_STRIKE_BAND_BPS, EInvalidPolicy);
    assert!((reserve_bps as u64) < BPS_DENOMINATOR, EInvalidPolicy);
    assert!(max_plp_allocation_bps > 0 && max_plp_allocation_bps <= MAX_PLP_ALLOCATION_BPS, EInvalidPolicy);
    assert!(
        (downside_budget_bps as u64)
            + (upside_budget_bps as u64)
            + (reserve_bps as u64)
            + (max_plp_allocation_bps as u64)
            <= BPS_DENOMINATOR,
        EInvalidPolicy,
    );
    assert!(max_leg_ask_bps > 0 && max_leg_ask_bps <= MAX_LEG_ASK_BPS, EInvalidPolicy);
    Policy { downside_budget_bps, upside_budget_bps, strike_band_bps, reserve_bps, max_plp_allocation_bps, max_leg_ask_bps }
}

public fun downside_budget_bps(policy: &Policy): u16 { policy.downside_budget_bps }

public fun upside_budget_bps(policy: &Policy): u16 { policy.upside_budget_bps }

public fun strike_band_bps(policy: &Policy): u16 { policy.strike_band_bps }

public fun reserve_bps(policy: &Policy): u16 { policy.reserve_bps }

public fun max_plp_allocation_bps(policy: &Policy): u16 { policy.max_plp_allocation_bps }

public fun max_leg_ask_bps(policy: &Policy): u64 { policy.max_leg_ask_bps }
