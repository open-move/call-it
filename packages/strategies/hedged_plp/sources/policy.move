/// Policy bounds for the CallIt Hedged PLP strategy.
module hedged_plp_strategy::policy;

const BPS_DENOMINATOR: u64 = 10_000;
const MAX_HEDGE_BUDGET_BPS: u16 = 5_000;
const MAX_STRIKE_BAND_BPS: u16 = 5_000;
const MAX_PLP_ALLOCATION_BPS: u16 = 10_000;
const MAX_HEDGE_ASK_BPS: u64 = 10_000;

const EInvalidPolicy: u64 = 1;

public struct Policy has copy, drop, store {
    hedge_budget_bps: u16,
    strike_band_bps: u16,
    reserve_bps: u16,
    max_plp_allocation_bps: u16,
    max_hedge_ask_bps: u64,
}

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
