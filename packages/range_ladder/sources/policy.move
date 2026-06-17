/// Owned Range Ladder claim ticket.
module range_ladder::policy;

use sui::{
    clock::Clock,
    object::{Self, ID, UID},
};

use deepbook_predict::range_key::{Self, RangeKey};

const MAX_RUNG_COUNT: u64 = 16;

#[error]
const EEmptyLadder: vector<u8> = b"Range ladder must contain at least one rung";

#[error]
const ETooManyRungs: vector<u8> = b"Range ladder has too many rungs";

#[error]
const EInvalidRung: vector<u8> = b"Range rung must have ordered strikes and non-zero quantity";

#[error]
const EWrongPredict: vector<u8> = b"Predict object does not match range ladder policy";

#[error]
const EWrongManager: vector<u8> = b"PredictManager does not match range ladder policy";

#[error]
const EWrongOracle: vector<u8> = b"Oracle does not match range ladder policy";

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

public struct RangeLadderPolicy<phantom Quote> has key, store {
    id: UID,
    premium_amount: u64,
    predict_id: ID,
    manager_id: ID,
    positions: vector<RangePosition>,
    total_cost: u64,
    created_at_ms: u64,
}

public fun new_rung(lower_strike: u64, higher_strike: u64, quantity: u64): RangeRung {
    assert_valid_rung_terms(lower_strike, higher_strike, quantity);
    RangeRung { lower_strike, higher_strike, quantity }
}

public(package) fun new_position(key: RangeKey, quantity: u64, cost: u64): RangePosition {
    RangePosition { key, quantity, cost }
}

public(package) fun new<Quote>(
    premium_amount: u64,
    predict_id: ID,
    manager_id: ID,
    positions: vector<RangePosition>,
    total_cost: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): RangeLadderPolicy<Quote> {
    assert_valid_positions(&positions);
    RangeLadderPolicy<Quote> {
        id: object::new(ctx),
        premium_amount,
        predict_id,
        manager_id,
        positions,
        total_cost,
        created_at_ms: clock.timestamp_ms(),
    }
}

public(package) fun destroy<Quote>(policy: RangeLadderPolicy<Quote>): ID {
    let RangeLadderPolicy { id, .. } = policy;
    let policy_id = id.to_inner();
    id.delete();
    policy_id
}

public(package) fun assert_predict<Quote>(policy: &RangeLadderPolicy<Quote>, predict_id: ID) {
    assert!(policy.predict_id == predict_id, EWrongPredict);
}

public(package) fun assert_manager<Quote>(policy: &RangeLadderPolicy<Quote>, manager_id: ID) {
    assert!(policy.manager_id == manager_id, EWrongManager);
}

public(package) fun assert_oracle<Quote>(policy: &RangeLadderPolicy<Quote>, oracle_id: ID) {
    policy.positions.do_ref!(|position| assert!(range_key::oracle_id(&position.key) == oracle_id, EWrongOracle));
}

public(package) fun id<Quote>(policy: &RangeLadderPolicy<Quote>): ID {
    policy.id.to_inner()
}

public(package) fun premium_amount<Quote>(policy: &RangeLadderPolicy<Quote>): u64 {
    policy.premium_amount
}

public(package) fun created_at_ms<Quote>(policy: &RangeLadderPolicy<Quote>): u64 {
    policy.created_at_ms
}

public(package) fun predict_id<Quote>(policy: &RangeLadderPolicy<Quote>): ID {
    policy.predict_id
}

public(package) fun manager_id<Quote>(policy: &RangeLadderPolicy<Quote>): ID {
    policy.manager_id
}

public(package) fun positions<Quote>(policy: &RangeLadderPolicy<Quote>): vector<RangePosition> {
    policy.positions
}

public(package) fun total_cost<Quote>(policy: &RangeLadderPolicy<Quote>): u64 {
    policy.total_cost
}

public(package) fun rung_count<Quote>(policy: &RangeLadderPolicy<Quote>): u64 {
    policy.positions.length()
}

public fun lower_strike(rung: &RangeRung): u64 {
    rung.lower_strike
}

public fun higher_strike(rung: &RangeRung): u64 {
    rung.higher_strike
}

public fun quantity(rung: &RangeRung): u64 {
    rung.quantity
}

public fun position_key(position: &RangePosition): RangeKey {
    position.key
}

public fun position_quantity(position: &RangePosition): u64 {
    position.quantity
}

public fun position_cost(position: &RangePosition): u64 {
    position.cost
}

public(package) fun assert_valid_rungs(rungs: &vector<RangeRung>) {
    let count = rungs.length();
    assert!(count > 0, EEmptyLadder);
    assert!(count <= MAX_RUNG_COUNT, ETooManyRungs);
    count.do!(|index| {
        let rung = &rungs[index];
        assert_valid_rung_terms(rung.lower_strike, rung.higher_strike, rung.quantity);
    });
}

fun assert_valid_positions(positions: &vector<RangePosition>) {
    let count = positions.length();
    assert!(count > 0, EEmptyLadder);
    assert!(count <= MAX_RUNG_COUNT, ETooManyRungs);
    count.do!(|index| assert!(positions[index].quantity > 0, EInvalidRung));
}

fun assert_valid_rung_terms(lower_strike: u64, higher_strike: u64, quantity: u64) {
    assert!(lower_strike < higher_strike && quantity > 0, EInvalidRung);
}
