/// Policy bounds for the managed Bullish Upside strategy.
///
/// A `Policy` is an immutable, validated bundle of basis-point limits that the
/// strategy reads each round to size its premium spend, pick a valid strike, and
/// cap how much it will pay for the UP leg. All values are validated at
/// construction so the strategy can trust them without re-checking.
module bullish_upside_strategy::policy;

/// Basis-point denominator: 10_000 bps == 100%.
const BPS_DENOMINATOR: u64 = 10_000;
/// A premium budget may not exceed 100% of NAV.
const MAX_PREMIUM_BUDGET_BPS: u16 = 10_000;
/// A strike may sit at most 50% above spot.
const MAX_STRIKE_BAND_BPS: u16 = 5_000;
/// The UP ask ceiling may not exceed 100% of quantity (a full-priced binary).
const MAX_UP_ASK_BPS: u64 = 10_000;

#[error]
const EInvalidPolicy: vector<u8> = b"Policy parameters are out of their permitted bounds";

/// Validated per-round trading limits for the strategy. Copyable so views can
/// hand out a snapshot.
public struct Policy has copy, drop, store {
    /// Share of NAV (bps) the strategy may spend on premium each round.
    premium_budget_bps: u16,
    /// Max distance above spot (bps) at which a strike is still accepted.
    strike_band_bps: u16,
    /// Share of NAV (bps) held back as reserve and never deployed to premium.
    reserve_bps: u16,
    /// Ceiling on the per-unit UP ask price (bps of quantity) the strategy pays.
    max_up_ask_bps: u64,
}

/// Build a validated `Policy`. Aborts unless every bound holds: premium budget
/// and strike band are positive and within their caps, reserve is below 100%,
/// premium budget plus reserve together fit within NAV, and the ask ceiling is
/// positive and within its cap.
public fun new(
    premium_budget_bps: u16,
    strike_band_bps: u16,
    reserve_bps: u16,
    max_up_ask_bps: u64,
): Policy {
    assert!(premium_budget_bps > 0 && premium_budget_bps <= MAX_PREMIUM_BUDGET_BPS, EInvalidPolicy);
    assert!(strike_band_bps > 0 && strike_band_bps <= MAX_STRIKE_BAND_BPS, EInvalidPolicy);
    assert!((reserve_bps as u64) < BPS_DENOMINATOR, EInvalidPolicy);
    // Premium and reserve must coexist within NAV; otherwise a round could not be funded.
    assert!((premium_budget_bps as u64) + (reserve_bps as u64) <= BPS_DENOMINATOR, EInvalidPolicy);
    assert!(max_up_ask_bps > 0 && max_up_ask_bps <= MAX_UP_ASK_BPS, EInvalidPolicy);
    Policy { premium_budget_bps, strike_band_bps, reserve_bps, max_up_ask_bps }
}

public fun premium_budget_bps(policy: &Policy): u16 { policy.premium_budget_bps }

public fun strike_band_bps(policy: &Policy): u16 { policy.strike_band_bps }

public fun reserve_bps(policy: &Policy): u16 { policy.reserve_bps }

public fun max_up_ask_bps(policy: &Policy): u64 { policy.max_up_ask_bps }
