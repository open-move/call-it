/// Shared Range Ladder policy object and owner capability.
module range_ladder::policy;

use sui::{
    clock::Clock,
    object::{Self, ID, UID},
    transfer,
};

const MAX_RUNG_COUNT: u64 = 16;

#[error]
const EEmptyLadder: vector<u8> = b"Range ladder must contain at least one rung";

#[error]
const ETooManyRungs: vector<u8> = b"Range ladder has too many rungs";

#[error]
const EInvalidRung: vector<u8> = b"Range rung must have ordered strikes and non-zero quantity";

#[error]
const EWrongOwnerCap: vector<u8> = b"Owner cap does not match range ladder policy";

#[error]
const EWrongPredict: vector<u8> = b"Predict object does not match range ladder policy";

#[error]
const EWrongManager: vector<u8> = b"PredictManager does not match range ladder policy";

#[error]
const EWrongOracle: vector<u8> = b"Oracle does not match range ladder policy";

#[error]
const EPolicySettled: vector<u8> = b"Range ladder policy is already settled";

#[error]
const EInvalidBeneficiary: vector<u8> = b"Beneficiary must be non-zero";

public struct RangeRung has copy, drop, store {
    lower_strike: u64,
    higher_strike: u64,
    quantity: u64,
    cost: u64,
}

public struct RangeLadderPolicy<phantom Quote> has key {
    id: UID,
    beneficiary: address,
    premium_amount: u64,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    total_cost: u64,
    rungs: vector<RangeRung>,
    created_at_ms: u64,
    settled: bool,
}

public struct RangeLadderOwnerCap<phantom Quote> has key, store {
    id: UID,
    policy_id: ID,
}

public fun new_rung(lower_strike: u64, higher_strike: u64, quantity: u64): RangeRung {
    assert_valid_rung_terms(lower_strike, higher_strike, quantity);
    RangeRung { lower_strike, higher_strike, quantity, cost: 0 }
}

public(package) fun new_rung_with_cost(
    lower_strike: u64,
    higher_strike: u64,
    quantity: u64,
    cost: u64,
): RangeRung {
    assert_valid_rung_terms(lower_strike, higher_strike, quantity);
    RangeRung { lower_strike, higher_strike, quantity, cost }
}

public(package) fun new<Quote>(
    beneficiary: address,
    premium_amount: u64,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    total_cost: u64,
    rungs: vector<RangeRung>,
    clock: &Clock,
    ctx: &mut TxContext,
): (RangeLadderPolicy<Quote>, RangeLadderOwnerCap<Quote>) {
    assert_valid_beneficiary(beneficiary);
    assert_valid_rungs(&rungs);

    let created_at_ms = clock.timestamp_ms();
    let policy = RangeLadderPolicy<Quote> {
        id: object::new(ctx),
        beneficiary,
        premium_amount,
        predict_id,
        manager_id,
        oracle_id,
        expiry_ms,
        total_cost,
        rungs,
        created_at_ms,
        settled: false,
    };
    let policy_id = policy.id.to_inner();
    let cap = RangeLadderOwnerCap<Quote> { id: object::new(ctx), policy_id };

    (policy, cap)
}

public(package) fun share<Quote>(policy: RangeLadderPolicy<Quote>) {
    transfer::share_object(policy);
}

public(package) fun set_beneficiary<Quote>(
    policy: &mut RangeLadderPolicy<Quote>,
    cap: &RangeLadderOwnerCap<Quote>,
    new_beneficiary: address,
): address {
    assert_unsettled(policy);
    assert_owner_cap(policy, cap);
    assert_valid_beneficiary(new_beneficiary);
    let old_beneficiary = policy.beneficiary;
    policy.beneficiary = new_beneficiary;
    old_beneficiary
}

public(package) fun assert_valid_beneficiary(beneficiary: address) {
    assert!(beneficiary != @0x0, EInvalidBeneficiary);
}

public(package) fun destroy_owner_cap<Quote>(cap: RangeLadderOwnerCap<Quote>, policy_id: ID): ID {
    let RangeLadderOwnerCap { id, policy_id: cap_policy_id } = cap;
    assert!(cap_policy_id == policy_id, EWrongOwnerCap);
    let cap_id = id.to_inner();
    id.delete();
    cap_id
}

public(package) fun mark_settled<Quote>(
    policy: &mut RangeLadderPolicy<Quote>,
    clock: &Clock,
): u64 {
    assert_unsettled(policy);
    policy.settled = true;
    clock.timestamp_ms()
}

public(package) fun assert_owner_cap<Quote>(
    policy: &RangeLadderPolicy<Quote>,
    cap: &RangeLadderOwnerCap<Quote>,
) {
    assert!(cap.policy_id == policy.id.to_inner(), EWrongOwnerCap);
}

public(package) fun assert_predict<Quote>(policy: &RangeLadderPolicy<Quote>, predict_id: ID) {
    assert!(policy.predict_id == predict_id, EWrongPredict);
}

public(package) fun assert_manager<Quote>(policy: &RangeLadderPolicy<Quote>, manager_id: ID) {
    assert!(policy.manager_id == manager_id, EWrongManager);
}

public(package) fun assert_oracle<Quote>(policy: &RangeLadderPolicy<Quote>, oracle_id: ID) {
    assert!(policy.oracle_id == oracle_id, EWrongOracle);
}

public(package) fun assert_unsettled<Quote>(policy: &RangeLadderPolicy<Quote>) {
    assert!(!policy.settled, EPolicySettled);
}

public(package) fun id<Quote>(policy: &RangeLadderPolicy<Quote>): ID {
    policy.id.to_inner()
}

public(package) fun owner_cap_id<Quote>(cap: &RangeLadderOwnerCap<Quote>): ID {
    cap.id.to_inner()
}

public(package) fun beneficiary<Quote>(policy: &RangeLadderPolicy<Quote>): address {
    policy.beneficiary
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

public(package) fun oracle_id<Quote>(policy: &RangeLadderPolicy<Quote>): ID {
    policy.oracle_id
}

public(package) fun expiry_ms<Quote>(policy: &RangeLadderPolicy<Quote>): u64 {
    policy.expiry_ms
}

public(package) fun rungs<Quote>(policy: &RangeLadderPolicy<Quote>): vector<RangeRung> {
    policy.rungs
}

public(package) fun total_cost<Quote>(policy: &RangeLadderPolicy<Quote>): u64 {
    policy.total_cost
}

public(package) fun rung_count<Quote>(policy: &RangeLadderPolicy<Quote>): u64 {
    policy.rungs.length()
}

public(package) fun settled<Quote>(policy: &RangeLadderPolicy<Quote>): bool {
    policy.settled
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

public fun cost(rung: &RangeRung): u64 {
    rung.cost
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

fun assert_valid_rung_terms(lower_strike: u64, higher_strike: u64, quantity: u64) {
    assert!(lower_strike < higher_strike && quantity > 0, EInvalidRung);
}
