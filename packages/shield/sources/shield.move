/// Shield structured product claim-ticket facade.
module shield::shield;

use sui::{
    clock::Clock,
    coin::{Self, Coin},
    event,
    object::{Self, ID},
};

use deepbook_predict::{
    oracle::{Self, OracleSVI},
    predict::{Self, Predict},
    predict_manager::PredictManager,
};

use shield::{
    hedge,
    policy::{Self, ShieldPolicy},
};

public struct ShieldOpened<phantom Quote> has copy, drop {
    policy_id: ID,
    created_at_ms: u64,
}

public struct ShieldClaimed<phantom Quote> has copy, drop {
    policy_id: ID,
    plp_quote_amount: u64,
    hedge_payout_amount: u64,
    quote_amount: u64,
    claimed_at_ms: u64,
}

public fun open<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    payment: Coin<Quote>,
    hedge_budget_amount: u64,
    max_loss_bps: u16,
    hedge_strike: u64,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (ShieldPolicy<Quote>, Coin<Quote>) {
    let mut hedge_receipt = hedge::open<Quote>(
        predict,
        manager,
        oracle,
        payment,
        hedge_budget_amount,
        max_loss_bps,
        hedge_strike,
        hedge_quantity,
        clock,
        ctx,
    );
    let key = hedge::key(&hedge_receipt);
    let plp = hedge::take_plp(&mut hedge_receipt, ctx);
    let refund = hedge::into_refund(hedge_receipt, ctx);
    let policy = policy::new<Quote>(
        plp,
        object::id(predict),
        object::id(manager),
        key,
        hedge_quantity,
        clock,
        ctx,
    );

    event::emit(ShieldOpened<Quote> {
        policy_id: policy.id(),
        created_at_ms: policy.created_at_ms(),
    });

    (policy, refund)
}

public fun claim<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    mut policy: ShieldPolicy<Quote>,
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
    let plp_balance = policy.take_plp();
    let policy_id = policy::destroy(policy);
    let claimed_at_ms = clock.timestamp_ms();
    let plp = coin::from_balance(plp_balance, ctx);
    let plp_quote = predict.withdraw<Quote>(plp, clock, ctx);
    let plp_quote_amount = plp_quote.value();
    let mut payout = hedge::into_payout(hedge_receipt, ctx);
    payout.join(plp_quote);
    let quote_amount = payout.value();

    event::emit(ShieldClaimed<Quote> {
        policy_id,
        plp_quote_amount,
        hedge_payout_amount,
        quote_amount,
        claimed_at_ms,
    });

    payout
}

fun assert_bindings<Quote>(
    policy: &ShieldPolicy<Quote>,
    predict: &Predict,
    manager: &PredictManager,
    oracle: &OracleSVI,
) {
    policy.assert_predict(object::id(predict));
    policy.assert_manager(object::id(manager));
    policy.assert_oracle(oracle.id());
}
