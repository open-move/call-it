/// Shared Shield policy object and owner capability.
module shield::policy;

use sui::{
    balance::Balance,
    clock::Clock,
    coin::Coin,
    object::{Self, ID, UID},
    transfer,
};

use deepbook_predict::plp::PLP;

#[error]
const EEmptyPolicy: vector<u8> = b"Policy must custody a non-zero LP balance";

#[error]
const EWrongOwnerCap: vector<u8> = b"Owner cap does not match policy";

#[error]
const EWrongPredict: vector<u8> = b"Predict object does not match policy";

#[error]
const EWrongManager: vector<u8> = b"PredictManager does not match policy";

#[error]
const EWrongOracle: vector<u8> = b"Oracle does not match policy";

#[error]
const EPolicySettled: vector<u8> = b"Policy is already settled";

#[error]
const EInvalidBeneficiary: vector<u8> = b"Beneficiary must be non-zero";

public struct ShieldPolicy<phantom Quote> has key {
    id: UID,
    beneficiary: address,
    deposit_amount: u64,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    hedge_expiry_ms: u64,
    hedge_strike: u64,
    hedge_quantity: u64,
    max_loss_bps: u16,
    hedge_budget_amount: u64,
    hedge_cost: u64,
    plp_balance: Balance<PLP>,
    created_at_ms: u64,
    settled: bool,
}

public struct ShieldOwnerCap<phantom Quote> has key, store {
    id: UID,
    policy_id: ID,
}

public(package) fun new<Quote>(
    plp: Coin<PLP>,
    beneficiary: address,
    deposit_amount: u64,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    hedge_expiry_ms: u64,
    hedge_strike: u64,
    hedge_quantity: u64,
    max_loss_bps: u16,
    hedge_budget_amount: u64,
    hedge_cost: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (ShieldPolicy<Quote>, ShieldOwnerCap<Quote>) {
    assert_valid_beneficiary(beneficiary);
    let plp_amount = plp.value();
    assert!(plp_amount > 0, EEmptyPolicy);

    let created_at_ms = clock.timestamp_ms();
    let policy = ShieldPolicy<Quote> {
        id: object::new(ctx),
        beneficiary,
        deposit_amount,
        predict_id,
        manager_id,
        oracle_id,
        hedge_expiry_ms,
        hedge_strike,
        hedge_quantity,
        max_loss_bps,
        hedge_budget_amount,
        hedge_cost,
        plp_balance: plp.into_balance(),
        created_at_ms,
        settled: false,
    };
    let policy_id = policy.id.to_inner();
    let cap = ShieldOwnerCap<Quote> { id: object::new(ctx), policy_id };

    (policy, cap)
}

public(package) fun share<Quote>(policy: ShieldPolicy<Quote>) {
    transfer::share_object(policy);
}

public(package) fun set_beneficiary<Quote>(
    policy: &mut ShieldPolicy<Quote>,
    cap: &ShieldOwnerCap<Quote>,
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

public(package) fun destroy_owner_cap<Quote>(cap: ShieldOwnerCap<Quote>, policy_id: ID): ID {
    let ShieldOwnerCap { id, policy_id: cap_policy_id } = cap;
    assert!(cap_policy_id == policy_id, EWrongOwnerCap);
    let cap_id = id.to_inner();
    id.delete();
    cap_id
}

public(package) fun settle_and_take_plp<Quote>(
    policy: &mut ShieldPolicy<Quote>,
): Balance<PLP> {
    assert_unsettled(policy);
    let plp_amount = policy.plp_balance.value();
    let plp_balance = policy.plp_balance.split(plp_amount);
    policy.settled = true;
    plp_balance
}

public(package) fun assert_owner_cap<Quote>(policy: &ShieldPolicy<Quote>, cap: &ShieldOwnerCap<Quote>) {
    assert!(cap.policy_id == policy.id.to_inner(), EWrongOwnerCap);
}

public(package) fun assert_predict<Quote>(policy: &ShieldPolicy<Quote>, predict_id: ID) {
    assert!(policy.predict_id == predict_id, EWrongPredict);
}

public(package) fun assert_manager<Quote>(policy: &ShieldPolicy<Quote>, manager_id: ID) {
    assert!(policy.manager_id == manager_id, EWrongManager);
}

public(package) fun assert_oracle<Quote>(policy: &ShieldPolicy<Quote>, oracle_id: ID) {
    assert!(policy.oracle_id == oracle_id, EWrongOracle);
}

public(package) fun assert_unsettled<Quote>(policy: &ShieldPolicy<Quote>) {
    assert!(!policy.settled, EPolicySettled);
}

public(package) fun id<Quote>(policy: &ShieldPolicy<Quote>): ID {
    policy.id.to_inner()
}

public(package) fun owner_cap_id<Quote>(cap: &ShieldOwnerCap<Quote>): ID {
    cap.id.to_inner()
}

public(package) fun beneficiary<Quote>(policy: &ShieldPolicy<Quote>): address {
    policy.beneficiary
}

public(package) fun deposit_amount<Quote>(policy: &ShieldPolicy<Quote>): u64 {
    policy.deposit_amount
}

public(package) fun created_at_ms<Quote>(policy: &ShieldPolicy<Quote>): u64 {
    policy.created_at_ms
}

public(package) fun predict_id<Quote>(policy: &ShieldPolicy<Quote>): ID {
    policy.predict_id
}

public(package) fun manager_id<Quote>(policy: &ShieldPolicy<Quote>): ID {
    policy.manager_id
}

public(package) fun oracle_id<Quote>(policy: &ShieldPolicy<Quote>): ID {
    policy.oracle_id
}

public(package) fun hedge_expiry_ms<Quote>(policy: &ShieldPolicy<Quote>): u64 {
    policy.hedge_expiry_ms
}

public(package) fun hedge_strike<Quote>(policy: &ShieldPolicy<Quote>): u64 {
    policy.hedge_strike
}

public(package) fun hedge_quantity<Quote>(policy: &ShieldPolicy<Quote>): u64 {
    policy.hedge_quantity
}

public(package) fun plp_amount<Quote>(policy: &ShieldPolicy<Quote>): u64 {
    policy.plp_balance.value()
}

public(package) fun settled<Quote>(policy: &ShieldPolicy<Quote>): bool {
    policy.settled
}
