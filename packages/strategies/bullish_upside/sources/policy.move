/// Policy bounds for the managed Bullish Upside strategy.
module bullish_upside_strategy::policy;

const BPS_DENOMINATOR: u64 = 10_000;
const MAX_PREMIUM_BUDGET_BPS: u16 = 10_000;
const MAX_STRIKE_BAND_BPS: u16 = 5_000;
const MAX_UP_ASK_BPS: u64 = 10_000;

const EInvalidPolicy: u64 = 1;

public struct Policy has copy, drop, store {
    premium_budget_bps: u16,
    strike_band_bps: u16,
    reserve_bps: u16,
    max_up_ask_bps: u64,
}

public fun new(
    premium_budget_bps: u16,
    strike_band_bps: u16,
    reserve_bps: u16,
    max_up_ask_bps: u64,
): Policy {
    assert!(premium_budget_bps > 0 && premium_budget_bps <= MAX_PREMIUM_BUDGET_BPS, EInvalidPolicy);
    assert!(strike_band_bps > 0 && strike_band_bps <= MAX_STRIKE_BAND_BPS, EInvalidPolicy);
    assert!((reserve_bps as u64) < BPS_DENOMINATOR, EInvalidPolicy);
    assert!((premium_budget_bps as u64) + (reserve_bps as u64) <= BPS_DENOMINATOR, EInvalidPolicy);
    assert!(max_up_ask_bps > 0 && max_up_ask_bps <= MAX_UP_ASK_BPS, EInvalidPolicy);
    Policy { premium_budget_bps, strike_band_bps, reserve_bps, max_up_ask_bps }
}

public fun premium_budget_bps(policy: &Policy): u16 { policy.premium_budget_bps }

public fun strike_band_bps(policy: &Policy): u16 { policy.strike_band_bps }

public fun reserve_bps(policy: &Policy): u16 { policy.reserve_bps }

public fun max_up_ask_bps(policy: &Policy): u64 { policy.max_up_ask_bps }
