/// Policy bounds for the managed Strangle strategy.
///
/// A `Policy` is a small, copyable value object that captures the risk limits a
/// Strangle round must respect: how much NAV may be spent on premium, how far
/// the two strikes may sit from spot, how much cash to hold in reserve, and the
/// per-leg ask ceiling. The strategy reads these bounds when sizing and pricing
/// a round; `new` is the only constructor and validates every field, so a
/// `Policy` value is always within bounds once it exists.
module strangle_strategy::policy;

/// Basis-point denominator: 10_000 bps == 100%.
const BPS_DENOMINATOR: u64 = 10_000;
/// Premium budget may not exceed the entire NAV (100%).
const MAX_PREMIUM_BUDGET_BPS: u16 = 10_000;
/// Strikes may sit at most 5% away from spot.
const MAX_STRIKE_BAND_BPS: u16 = 500;
/// A single leg's ask may not exceed its quantity (100% of notional).
const MAX_LEG_ASK_BPS: u64 = 10_000;

#[error]
const EInvalidPolicy: vector<u8> = b"Policy field is out of bounds";

/// Validated risk bounds for a Strangle round. All fields are in basis points.
public struct Policy has copy, drop, store {
    /// Fraction of NAV the round may spend on premium across both legs.
    premium_budget_bps: u16,
    /// Maximum distance each strike may sit from spot.
    strike_band_bps: u16,
    /// Fraction of NAV to keep as uninvested reserve.
    reserve_bps: u16,
    /// Ceiling on a single leg's ask cost, as a fraction of its quantity.
    max_leg_ask_bps: u64,
}

/// Construct a `Policy`, asserting every field is within bounds. The premium
/// budget must be positive and at most 100%; the strike band must be positive
/// and within `MAX_STRIKE_BAND_BPS`; the reserve must be strictly below 100% and
/// must not, together with the premium budget, exceed 100% of NAV; the per-leg
/// ask ceiling must be positive and at most 100% of notional.
public fun new(
    premium_budget_bps: u16,
    strike_band_bps: u16,
    reserve_bps: u16,
    max_leg_ask_bps: u64,
): Policy {
    assert!(premium_budget_bps > 0 && premium_budget_bps <= MAX_PREMIUM_BUDGET_BPS, EInvalidPolicy);
    assert!(strike_band_bps > 0 && strike_band_bps <= MAX_STRIKE_BAND_BPS, EInvalidPolicy);
    assert!((reserve_bps as u64) < BPS_DENOMINATOR, EInvalidPolicy);
    // Premium and reserve together cannot claim more than the whole NAV.
    assert!((premium_budget_bps as u64) + (reserve_bps as u64) <= BPS_DENOMINATOR, EInvalidPolicy);
    assert!(max_leg_ask_bps > 0 && max_leg_ask_bps <= MAX_LEG_ASK_BPS, EInvalidPolicy);
    Policy { premium_budget_bps, strike_band_bps, reserve_bps, max_leg_ask_bps }
}

public fun premium_budget_bps(policy: &Policy): u16 { policy.premium_budget_bps }

public fun strike_band_bps(policy: &Policy): u16 { policy.strike_band_bps }

public fun reserve_bps(policy: &Policy): u16 { policy.reserve_bps }

public fun max_leg_ask_bps(policy: &Policy): u64 { policy.max_leg_ask_bps }
