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

public struct ShieldPolicy has key {
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
    plp_amount: u64,
    created_at_ms: u64,
    settled: bool,
}

public struct ShieldOwnerCap has key, store {
    id: UID,
    policy_id: ID,
}

public(package) fun new_shared(
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
): (ShieldOwnerCap, ID, ID, u64, u64) {
    let plp_amount = plp.value();
    assert!(plp_amount > 0, EEmptyPolicy);

    let created_at_ms = clock.timestamp_ms();
    let policy = ShieldPolicy {
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
        plp_amount,
        created_at_ms,
        settled: false,
    };
    let policy_id = policy.id.to_inner();
    let cap = ShieldOwnerCap { id: object::new(ctx), policy_id };
    let owner_cap_id = cap.id.to_inner();

    transfer::share_object(policy);
    (cap, policy_id, owner_cap_id, plp_amount, created_at_ms)
}

public(package) fun set_beneficiary(
    policy: &mut ShieldPolicy,
    cap: &ShieldOwnerCap,
    new_beneficiary: address,
): address {
    assert_unsettled(policy);
    assert_owner_cap(policy, cap);
    let old_beneficiary = policy.beneficiary;
    policy.beneficiary = new_beneficiary;
    old_beneficiary
}

public(package) fun destroy_owner_cap(cap: ShieldOwnerCap, policy_id: ID): ID {
    let ShieldOwnerCap { id, policy_id: cap_policy_id } = cap;
    assert!(cap_policy_id == policy_id, EWrongOwnerCap);
    let cap_id = id.to_inner();
    id.delete();
    cap_id
}

public(package) fun settle_and_take_plp(
    policy: &mut ShieldPolicy,
    clock: &Clock,
): (Balance<PLP>, ID, address, u64, ID, ID, ID, u64, u64, u64, u64, u64) {
    assert_unsettled(policy);
    let plp_amount = policy.plp_amount;
    let plp_balance = policy.plp_balance.split(plp_amount);
    policy.plp_amount = 0;
    policy.settled = true;

    (
        plp_balance,
        policy.id.to_inner(),
        policy.beneficiary,
        policy.deposit_amount,
        policy.predict_id,
        policy.manager_id,
        policy.oracle_id,
        policy.hedge_expiry_ms,
        policy.hedge_strike,
        policy.hedge_quantity,
        plp_amount,
        clock.timestamp_ms(),
    )
}

public(package) fun assert_owner_cap(policy: &ShieldPolicy, cap: &ShieldOwnerCap) {
    assert!(cap.policy_id == policy.id.to_inner(), EWrongOwnerCap);
}

public(package) fun assert_predict(policy: &ShieldPolicy, predict_id: ID) {
    assert!(policy.predict_id == predict_id, EWrongPredict);
}

public(package) fun assert_manager(policy: &ShieldPolicy, manager_id: ID) {
    assert!(policy.manager_id == manager_id, EWrongManager);
}

public(package) fun assert_oracle(policy: &ShieldPolicy, oracle_id: ID) {
    assert!(policy.oracle_id == oracle_id, EWrongOracle);
}

public(package) fun assert_unsettled(policy: &ShieldPolicy) {
    assert!(!policy.settled, EPolicySettled);
}

public(package) fun id(policy: &ShieldPolicy): ID {
    policy.id.to_inner()
}

public(package) fun owner_cap_id(cap: &ShieldOwnerCap): ID {
    cap.id.to_inner()
}

public(package) fun oracle_id(policy: &ShieldPolicy): ID {
    policy.oracle_id
}

public(package) fun hedge_expiry_ms(policy: &ShieldPolicy): u64 {
    policy.hedge_expiry_ms
}

public(package) fun hedge_strike(policy: &ShieldPolicy): u64 {
    policy.hedge_strike
}

public(package) fun hedge_quantity(policy: &ShieldPolicy): u64 {
    policy.hedge_quantity
}

public(package) fun settled(policy: &ShieldPolicy): bool {
    policy.settled
}
