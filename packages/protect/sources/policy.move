/// Shared Protect policy object and owner capability.
module protect::policy;

use sui::{
    clock::Clock,
    object::{Self, ID, UID},
    transfer,
};

#[error]
const EWrongOwnerCap: vector<u8> = b"Owner cap does not match protection policy";

#[error]
const EWrongPredict: vector<u8> = b"Predict object does not match protection policy";

#[error]
const EWrongManager: vector<u8> = b"PredictManager does not match protection policy";

#[error]
const EWrongOracle: vector<u8> = b"Oracle does not match protection policy";

#[error]
const EPolicySettled: vector<u8> = b"Protection policy is already settled";

#[error]
const EInvalidBeneficiary: vector<u8> = b"Beneficiary must be non-zero";

public struct ProtectionPolicy<phantom Quote> has key {
    id: UID,
    beneficiary: address,
    premium_amount: u64,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    hedge_expiry_ms: u64,
    hedge_strike: u64,
    hedge_is_up: bool,
    hedge_quantity: u64,
    hedge_cost: u64,
    created_at_ms: u64,
    settled: bool,
}

public struct ProtectionOwnerCap<phantom Quote> has key, store {
    id: UID,
    policy_id: ID,
}

public(package) fun new<Quote>(
    beneficiary: address,
    premium_amount: u64,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    hedge_expiry_ms: u64,
    hedge_strike: u64,
    hedge_is_up: bool,
    hedge_quantity: u64,
    hedge_cost: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (ProtectionPolicy<Quote>, ProtectionOwnerCap<Quote>) {
    assert_valid_beneficiary(beneficiary);

    let created_at_ms = clock.timestamp_ms();
    let policy = ProtectionPolicy<Quote> {
        id: object::new(ctx),
        beneficiary,
        premium_amount,
        predict_id,
        manager_id,
        oracle_id,
        hedge_expiry_ms,
        hedge_strike,
        hedge_is_up,
        hedge_quantity,
        hedge_cost,
        created_at_ms,
        settled: false,
    };
    let policy_id = policy.id.to_inner();
    let cap = ProtectionOwnerCap<Quote> { id: object::new(ctx), policy_id };

    (policy, cap)
}

public(package) fun share<Quote>(policy: ProtectionPolicy<Quote>) {
    transfer::share_object(policy);
}

public(package) fun set_beneficiary<Quote>(
    policy: &mut ProtectionPolicy<Quote>,
    cap: &ProtectionOwnerCap<Quote>,
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

public(package) fun destroy_owner_cap<Quote>(cap: ProtectionOwnerCap<Quote>, policy_id: ID): ID {
    let ProtectionOwnerCap { id, policy_id: cap_policy_id } = cap;
    assert!(cap_policy_id == policy_id, EWrongOwnerCap);
    let cap_id = id.to_inner();
    id.delete();
    cap_id
}

public(package) fun mark_settled<Quote>(
    policy: &mut ProtectionPolicy<Quote>,
    clock: &Clock,
): u64 {
    assert_unsettled(policy);
    policy.settled = true;
    clock.timestamp_ms()
}

public(package) fun assert_owner_cap<Quote>(
    policy: &ProtectionPolicy<Quote>,
    cap: &ProtectionOwnerCap<Quote>,
) {
    assert!(cap.policy_id == policy.id.to_inner(), EWrongOwnerCap);
}

public(package) fun assert_predict<Quote>(policy: &ProtectionPolicy<Quote>, predict_id: ID) {
    assert!(policy.predict_id == predict_id, EWrongPredict);
}

public(package) fun assert_manager<Quote>(policy: &ProtectionPolicy<Quote>, manager_id: ID) {
    assert!(policy.manager_id == manager_id, EWrongManager);
}

public(package) fun assert_oracle<Quote>(policy: &ProtectionPolicy<Quote>, oracle_id: ID) {
    assert!(policy.oracle_id == oracle_id, EWrongOracle);
}

public(package) fun assert_unsettled<Quote>(policy: &ProtectionPolicy<Quote>) {
    assert!(!policy.settled, EPolicySettled);
}

public(package) fun id<Quote>(policy: &ProtectionPolicy<Quote>): ID {
    policy.id.to_inner()
}

public(package) fun owner_cap_id<Quote>(cap: &ProtectionOwnerCap<Quote>): ID {
    cap.id.to_inner()
}

public(package) fun beneficiary<Quote>(policy: &ProtectionPolicy<Quote>): address {
    policy.beneficiary
}

public(package) fun premium_amount<Quote>(policy: &ProtectionPolicy<Quote>): u64 {
    policy.premium_amount
}

public(package) fun created_at_ms<Quote>(policy: &ProtectionPolicy<Quote>): u64 {
    policy.created_at_ms
}

public(package) fun predict_id<Quote>(policy: &ProtectionPolicy<Quote>): ID {
    policy.predict_id
}

public(package) fun manager_id<Quote>(policy: &ProtectionPolicy<Quote>): ID {
    policy.manager_id
}

public(package) fun oracle_id<Quote>(policy: &ProtectionPolicy<Quote>): ID {
    policy.oracle_id
}

public(package) fun hedge_expiry_ms<Quote>(policy: &ProtectionPolicy<Quote>): u64 {
    policy.hedge_expiry_ms
}

public(package) fun hedge_strike<Quote>(policy: &ProtectionPolicy<Quote>): u64 {
    policy.hedge_strike
}

public(package) fun hedge_is_up<Quote>(policy: &ProtectionPolicy<Quote>): bool {
    policy.hedge_is_up
}

public(package) fun hedge_quantity<Quote>(policy: &ProtectionPolicy<Quote>): u64 {
    policy.hedge_quantity
}

public(package) fun hedge_cost<Quote>(policy: &ProtectionPolicy<Quote>): u64 {
    policy.hedge_cost
}

public(package) fun settled<Quote>(policy: &ProtectionPolicy<Quote>): bool {
    policy.settled
}
