/// Standalone Predict hedge claim-ticket facade.
module protect::protect;

use sui::{
    clock::Clock,
    coin::Coin,
    event,
    object::{Self, ID},
};

use deepbook_predict::{
    oracle::{Self, OracleSVI},
    predict::Predict,
    predict_manager::PredictManager,
};

use protect::{
    hedge,
    policy::{Self, ProtectionPolicy},
};

public struct ProtectionOpened<phantom Quote> has copy, drop {
    policy_id: ID,
    created_at_ms: u64,
}

public struct ProtectionClaimed<phantom Quote> has copy, drop {
    policy_id: ID,
    hedge_payout_amount: u64,
    claimed_at_ms: u64,
}

public fun open<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    payment: Coin<Quote>,
    hedge_strike: u64,
    hedge_is_up: bool,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (ProtectionPolicy<Quote>, Coin<Quote>) {
    let hedge_receipt = hedge::open<Quote>(
        predict,
        manager,
        oracle,
        payment,
        hedge_strike,
        hedge_is_up,
        hedge_quantity,
        clock,
        ctx,
    );
    let policy = policy::new<Quote>(
        hedge::premium_amount(&hedge_receipt),
        object::id(predict),
        object::id(manager),
        hedge::key(&hedge_receipt),
        hedge_quantity,
        hedge::hedge_cost(&hedge_receipt),
        clock,
        ctx,
    );

    event::emit(ProtectionOpened<Quote> {
        policy_id: policy.id(),
        created_at_ms: policy.created_at_ms(),
    });

    (policy, hedge::into_refund(hedge_receipt, ctx))
}

public fun claim<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    policy: ProtectionPolicy<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert_bindings<Quote>(&policy, predict, manager, oracle);
    let hedge_receipt = hedge::redeem_and_withdraw<Quote>(
        predict,
        manager,
        oracle,
        policy.key(),
        policy.quantity(),
        clock,
        ctx,
    );
    let hedge_payout_amount = hedge::payout_amount(&hedge_receipt);
    let policy_id = policy::destroy(policy);
    let claimed_at_ms = clock.timestamp_ms();

    event::emit(ProtectionClaimed<Quote> {
        policy_id,
        hedge_payout_amount,
        claimed_at_ms,
    });

    hedge::into_payout(hedge_receipt, ctx)
}

fun assert_bindings<Quote>(
    policy: &ProtectionPolicy<Quote>,
    predict: &Predict,
    manager: &PredictManager,
    oracle: &OracleSVI,
) {
    policy.assert_predict(object::id(predict));
    policy.assert_manager(object::id(manager));
    policy.assert_oracle(oracle.id());
}
