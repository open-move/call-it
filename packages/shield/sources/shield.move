/// Shield structured product facade.
module shield::shield;

use sui::{
    clock::Clock,
    coin::{Self, Coin},
    event,
    object::{Self, ID},
    transfer,
};

use deepbook_predict::{
    oracle::{Self, OracleSVI},
    predict::{Self, Predict},
    predict_manager::PredictManager,
};

use shield::{
    hedge,
    policy::{Self, ShieldOwnerCap, ShieldPolicy},
};

public struct ShieldOpened<phantom Quote> has copy, drop {
    policy_id: ID,
    owner_cap_id: ID,
    beneficiary: address,
    predict_id: ID,
    deposit_amount: u64,
    plp_amount: u64,
    manager_id: ID,
    oracle_id: ID,
    hedge_expiry_ms: u64,
    hedge_strike: u64,
    hedge_quantity: u64,
    max_loss_bps: u16,
    hedge_budget_amount: u64,
    hedge_cost: u64,
    hedge_refund_amount: u64,
    created_at_ms: u64,
}

public struct ShieldClaimed<phantom Quote> has copy, drop {
    policy_id: ID,
    owner_cap_id: ID,
    beneficiary: address,
    deposit_amount: u64,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    hedge_expiry_ms: u64,
    hedge_strike: u64,
    hedge_quantity: u64,
    plp_amount: u64,
    plp_quote_amount: u64,
    hedge_payout_amount: u64,
    quote_amount: u64,
    claimed_at_ms: u64,
}

public struct ShieldSettled<phantom Quote> has copy, drop {
    policy_id: ID,
    beneficiary: address,
    deposit_amount: u64,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    hedge_expiry_ms: u64,
    hedge_strike: u64,
    hedge_quantity: u64,
    plp_amount: u64,
    plp_quote_amount: u64,
    hedge_payout_amount: u64,
    quote_amount: u64,
    settled_at_ms: u64,
}

public struct ShieldBeneficiaryUpdated<phantom Quote> has copy, drop {
    policy_id: ID,
    owner_cap_id: ID,
    old_beneficiary: address,
    new_beneficiary: address,
}

public fun open<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    payment: Coin<Quote>,
    beneficiary: address,
    hedge_budget_amount: u64,
    max_loss_bps: u16,
    hedge_strike: u64,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (ShieldOwnerCap<Quote>, Coin<Quote>) {
    let (plp, deposit_amount, hedge_expiry_ms, hedge_cost, hedge_refund_amount, refund) = hedge::open<Quote>(
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
    let predict_id = object::id(predict);
    let manager_id = object::id(manager);
    let oracle_id = oracle::id(oracle);
    let (cap, policy_id, owner_cap_id, plp_amount, created_at_ms) = policy::new_shared<Quote>(
        plp,
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
        clock,
        ctx,
    );

    event::emit(ShieldOpened<Quote> {
        policy_id,
        owner_cap_id,
        beneficiary,
        predict_id,
        deposit_amount,
        plp_amount,
        manager_id,
        oracle_id,
        hedge_expiry_ms,
        hedge_strike,
        hedge_quantity,
        max_loss_bps,
        hedge_budget_amount,
        hedge_cost,
        hedge_refund_amount,
        created_at_ms,
    });

    (cap, refund)
}

public fun set_beneficiary<Quote>(
    policy: &mut ShieldPolicy<Quote>,
    cap: &ShieldOwnerCap<Quote>,
    new_beneficiary: address,
) {
    let old_beneficiary = policy::set_beneficiary<Quote>(policy, cap, new_beneficiary);
    event::emit(ShieldBeneficiaryUpdated<Quote> {
        policy_id: policy::id(policy),
        owner_cap_id: policy::owner_cap_id(cap),
        old_beneficiary,
        new_beneficiary,
    });
}

public fun claim<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    policy: &mut ShieldPolicy<Quote>,
    cap: ShieldOwnerCap<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert_bindings<Quote>(policy, predict, manager, oracle);
    policy::assert_owner_cap<Quote>(policy, &cap);
    policy::assert_unsettled<Quote>(policy);
    let (hedge_payout_amount, mut payout) = hedge::redeem_and_withdraw<Quote>(
        predict,
        manager,
        oracle,
        policy::oracle_id(policy),
        policy::hedge_expiry_ms(policy),
        policy::hedge_strike(policy),
        policy::hedge_quantity(policy),
        clock,
        ctx,
    );
    let owner_cap_id = policy::destroy_owner_cap<Quote>(cap, policy::id<Quote>(policy));
    let (
        plp_balance,
        policy_id,
        beneficiary,
        deposit_amount,
        predict_id,
        manager_id,
        oracle_id,
        hedge_expiry_ms,
        hedge_strike,
        hedge_quantity,
        plp_amount,
        claimed_at_ms,
    ) = policy::settle_and_take_plp<Quote>(policy, clock);
    let plp = coin::from_balance(plp_balance, ctx);
    let plp_quote = predict::withdraw<Quote>(predict, plp, clock, ctx);
    let plp_quote_amount = plp_quote.value();
    payout.join(plp_quote);
    let quote_amount = payout.value();

    event::emit(ShieldClaimed<Quote> {
        policy_id,
        owner_cap_id,
        beneficiary,
        deposit_amount,
        predict_id,
        manager_id,
        oracle_id,
        hedge_expiry_ms,
        hedge_strike,
        hedge_quantity,
        plp_amount,
        plp_quote_amount,
        hedge_payout_amount,
        quote_amount,
        claimed_at_ms,
    });

    payout
}

/// Permissionless maturity settlement for keepers.
///
/// The hedge payout is redeemed into the user's PredictManager. The deployed
/// PredictManager only lets its owner withdraw, so this transfers the PLP
/// withdrawal to the policy beneficiary and reports the manager payout delta.
public fun settle<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    policy: &mut ShieldPolicy<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_bindings<Quote>(policy, predict, manager, oracle);
    policy::assert_unsettled<Quote>(policy);
    let hedge_payout_amount = hedge::redeem_to_manager<Quote>(
        predict,
        manager,
        oracle,
        policy::oracle_id(policy),
        policy::hedge_expiry_ms(policy),
        policy::hedge_strike(policy),
        policy::hedge_quantity(policy),
        clock,
        ctx,
    );
    let (
        plp_balance,
        policy_id,
        beneficiary,
        deposit_amount,
        predict_id,
        manager_id,
        oracle_id,
        hedge_expiry_ms,
        hedge_strike,
        hedge_quantity,
        plp_amount,
        settled_at_ms,
    ) = policy::settle_and_take_plp<Quote>(policy, clock);
    let plp = coin::from_balance(plp_balance, ctx);
    let payout = predict::withdraw<Quote>(predict, plp, clock, ctx);
    let plp_quote_amount = payout.value();
    let quote_amount = payout.value();

    event::emit(ShieldSettled<Quote> {
        policy_id,
        beneficiary,
        deposit_amount,
        predict_id,
        manager_id,
        oracle_id,
        hedge_expiry_ms,
        hedge_strike,
        hedge_quantity,
        plp_amount,
        plp_quote_amount,
        hedge_payout_amount,
        quote_amount,
        settled_at_ms,
    });

    transfer::public_transfer(payout, beneficiary);
}

fun assert_bindings<Quote>(
    policy: &ShieldPolicy<Quote>,
    predict: &Predict,
    manager: &PredictManager,
    oracle: &OracleSVI,
) {
    policy::assert_predict<Quote>(policy, object::id(predict));
    policy::assert_manager<Quote>(policy, object::id(manager));
    policy::assert_oracle<Quote>(policy, oracle::id(oracle));
}
