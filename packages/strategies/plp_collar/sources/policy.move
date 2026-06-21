/// Policy bounds for the managed PLP Collar strategy.
module plp_collar_strategy::policy;

const BPS_DENOMINATOR: u64 = 10_000;
const MAX_LEG_BUDGET_BPS: u16 = 5_000;
const MAX_STRIKE_BAND_BPS: u16 = 500;
const MAX_PLP_ALLOCATION_BPS: u16 = 10_000;
const MAX_LEG_ASK_BPS: u64 = 10_000;

const EInvalidPolicy: u64 = 1;

public struct Policy has copy, drop, store {
    downside_budget_bps: u16,
    upside_budget_bps: u16,
    strike_band_bps: u16,
    reserve_bps: u16,
    max_plp_allocation_bps: u16,
    max_leg_ask_bps: u64,
}

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
