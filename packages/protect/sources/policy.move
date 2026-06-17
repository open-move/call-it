/// Owned Protect claim ticket.
module protect::policy;

use sui::{
    clock::Clock,
    object::{Self, ID, UID},
};

use deepbook_predict::market_key::{Self, MarketKey};

#[error]
const EWrongPredict: vector<u8> = b"Predict object does not match protection policy";

#[error]
const EWrongManager: vector<u8> = b"PredictManager does not match protection policy";

#[error]
const EWrongOracle: vector<u8> = b"Oracle does not match protection policy";

public struct ProtectionPolicy<phantom Quote> has key, store {
    id: UID,
    premium_amount: u64,
    predict_id: ID,
    manager_id: ID,
    key: MarketKey,
    quantity: u64,
    hedge_cost: u64,
    created_at_ms: u64,
}

public(package) fun new<Quote>(
    premium_amount: u64,
    predict_id: ID,
    manager_id: ID,
    key: MarketKey,
    quantity: u64,
    hedge_cost: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ProtectionPolicy<Quote> {
    let created_at_ms = clock.timestamp_ms();
    ProtectionPolicy<Quote> {
        id: object::new(ctx),
        premium_amount,
        predict_id,
        manager_id,
        key,
        quantity,
        hedge_cost,
        created_at_ms,
    }
}

public(package) fun assert_predict<Quote>(policy: &ProtectionPolicy<Quote>, predict_id: ID) {
    assert!(policy.predict_id == predict_id, EWrongPredict);
}

public(package) fun assert_manager<Quote>(policy: &ProtectionPolicy<Quote>, manager_id: ID) {
    assert!(policy.manager_id == manager_id, EWrongManager);
}

public(package) fun assert_oracle<Quote>(policy: &ProtectionPolicy<Quote>, oracle_id: ID) {
    assert!(market_key::oracle_id(&policy.key) == oracle_id, EWrongOracle);
}

public(package) fun id<Quote>(policy: &ProtectionPolicy<Quote>): ID {
    policy.id.to_inner()
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

public(package) fun key<Quote>(policy: &ProtectionPolicy<Quote>): MarketKey {
    policy.key
}

public(package) fun quantity<Quote>(policy: &ProtectionPolicy<Quote>): u64 {
    policy.quantity
}

public(package) fun hedge_cost<Quote>(policy: &ProtectionPolicy<Quote>): u64 {
    policy.hedge_cost
}

public(package) fun destroy<Quote>(policy: ProtectionPolicy<Quote>): ID {
    let ProtectionPolicy { id, .. } = policy;
    let policy_id = id.to_inner();
    id.delete();
    policy_id
}
