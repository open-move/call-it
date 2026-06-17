/// Owned Shield claim ticket.
module shield::policy;

use sui::{
    balance::Balance,
    clock::Clock,
    coin::Coin,
    object::{Self, ID, UID},
};

use deepbook_predict::{
    market_key::{Self, MarketKey},
    plp::PLP,
};

#[error]
const EEmptyPolicy: vector<u8> = b"Policy must custody a non-zero LP balance";

#[error]
const EWrongPredict: vector<u8> = b"Predict object does not match policy";

#[error]
const EWrongManager: vector<u8> = b"PredictManager does not match policy";

#[error]
const EWrongOracle: vector<u8> = b"Oracle does not match policy";

public struct ShieldPolicy<phantom Quote> has key, store {
    id: UID,
    predict_id: ID,
    manager_id: ID,
    key: MarketKey,
    quantity: u64,
    plp_balance: Balance<PLP>,
    created_at_ms: u64,
}

public(package) fun new<Quote>(
    plp: Coin<PLP>,
    predict_id: ID,
    manager_id: ID,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ShieldPolicy<Quote> {
    assert!(plp.value() > 0, EEmptyPolicy);
    ShieldPolicy<Quote> {
        id: object::new(ctx),
        predict_id,
        manager_id,
        key,
        quantity,
        plp_balance: plp.into_balance(),
        created_at_ms: clock.timestamp_ms(),
    }
}

public(package) fun take_plp<Quote>(policy: &mut ShieldPolicy<Quote>): Balance<PLP> {
    let plp_amount = policy.plp_balance.value();
    policy.plp_balance.split(plp_amount)
}

public(package) fun destroy<Quote>(policy: ShieldPolicy<Quote>): ID {
    let ShieldPolicy { id, plp_balance, .. } = policy;
    plp_balance.destroy_zero();
    let policy_id = id.to_inner();
    id.delete();
    policy_id
}

public(package) fun assert_predict<Quote>(policy: &ShieldPolicy<Quote>, predict_id: ID) {
    assert!(policy.predict_id == predict_id, EWrongPredict);
}

public(package) fun assert_manager<Quote>(policy: &ShieldPolicy<Quote>, manager_id: ID) {
    assert!(policy.manager_id == manager_id, EWrongManager);
}

public(package) fun assert_oracle<Quote>(policy: &ShieldPolicy<Quote>, oracle_id: ID) {
    assert!(market_key::oracle_id(&policy.key) == oracle_id, EWrongOracle);
}

public(package) fun id<Quote>(policy: &ShieldPolicy<Quote>): ID {
    policy.id.to_inner()
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

public(package) fun key<Quote>(policy: &ShieldPolicy<Quote>): MarketKey {
    policy.key
}

public(package) fun quantity<Quote>(policy: &ShieldPolicy<Quote>): u64 {
    policy.quantity
}

public(package) fun plp_amount<Quote>(policy: &ShieldPolicy<Quote>): u64 {
    policy.plp_balance.value()
}
