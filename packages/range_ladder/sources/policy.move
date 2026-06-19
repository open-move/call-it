/// Policy and recorded range-position types for the managed Range Ladder vault.
module range_ladder::policy;

use deepbook_predict::range_key::RangeKey;

const BPS_DENOMINATOR: u64 = 10_000;
const MAX_PREMIUM_BUDGET_BPS: u16 = 10_000;
const MAX_RESERVE_BPS: u16 = 10_000;
const MAX_RANGE_ASK_BPS: u64 = 10_000;
const MAX_RUNG_COUNT_LIMIT: u64 = 16;

const EInvalidPolicy: u64 = 1;
const EEmptyLadder: u64 = 2;
const ETooManyRungs: u64 = 3;
const EInvalidRung: u64 = 4;

public struct RangeLadderPolicy has copy, drop, store {
    premium_budget_bps: u16,
    reserve_bps: u16,
    max_range_ask_bps: u64,
    max_rung_count: u64,
}

public struct RangeRung has copy, drop, store {
    lower_strike: u64,
    higher_strike: u64,
    quantity: u64,
}

public struct RangePosition has copy, drop, store {
    key: RangeKey,
    quantity: u64,
    cost: u64,
}

public fun new(
    premium_budget_bps: u16,
    reserve_bps: u16,
    max_range_ask_bps: u64,
    max_rung_count: u64,
): RangeLadderPolicy {
    assert!(premium_budget_bps > 0 && premium_budget_bps <= MAX_PREMIUM_BUDGET_BPS, EInvalidPolicy);
    assert!((reserve_bps as u64) < BPS_DENOMINATOR && reserve_bps <= MAX_RESERVE_BPS, EInvalidPolicy);
    assert!((premium_budget_bps as u64) + (reserve_bps as u64) <= BPS_DENOMINATOR, EInvalidPolicy);
    assert!(max_range_ask_bps > 0 && max_range_ask_bps <= MAX_RANGE_ASK_BPS, EInvalidPolicy);
    assert!(max_rung_count > 0 && max_rung_count <= MAX_RUNG_COUNT_LIMIT, EInvalidPolicy);
    RangeLadderPolicy { premium_budget_bps, reserve_bps, max_range_ask_bps, max_rung_count }
}

public fun new_rung(lower_strike: u64, higher_strike: u64, quantity: u64): RangeRung {
    assert_valid_rung_terms(lower_strike, higher_strike, quantity);
    RangeRung { lower_strike, higher_strike, quantity }
}

public(package) fun new_position(key: RangeKey, quantity: u64, cost: u64): RangePosition {
    RangePosition { key, quantity, cost }
}

public(package) fun assert_valid_rungs(policy: &RangeLadderPolicy, rungs: &vector<RangeRung>) {
    let count = rungs.length();
    assert!(count > 0, EEmptyLadder);
    assert!(count <= policy.max_rung_count, ETooManyRungs);
    count.do!(|index| {
        let rung = &rungs[index];
        assert_valid_rung_terms(rung.lower_strike, rung.higher_strike, rung.quantity);
    });
}

public fun premium_budget_bps(policy: &RangeLadderPolicy): u16 { policy.premium_budget_bps }

public fun reserve_bps(policy: &RangeLadderPolicy): u16 { policy.reserve_bps }

public fun max_range_ask_bps(policy: &RangeLadderPolicy): u64 { policy.max_range_ask_bps }

public fun max_rung_count(policy: &RangeLadderPolicy): u64 { policy.max_rung_count }

public fun lower_strike(rung: &RangeRung): u64 { rung.lower_strike }

public fun higher_strike(rung: &RangeRung): u64 { rung.higher_strike }

public fun quantity(rung: &RangeRung): u64 { rung.quantity }

public fun position_key(position: &RangePosition): RangeKey { position.key }

public fun position_quantity(position: &RangePosition): u64 { position.quantity }

public fun position_cost(position: &RangePosition): u64 { position.cost }

fun assert_valid_rung_terms(lower_strike: u64, higher_strike: u64, quantity: u64) {
    assert!(lower_strike < higher_strike && quantity > 0, EInvalidRung);
}
