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
use dusdc::dusdc::DUSDC;

use shield::{
    hedge,
    policy::{Self, ShieldOwnerCap, ShieldPolicy},
};

public struct ShieldOpened has copy, drop {
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

public struct ShieldClaimed has copy, drop {
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
    plp_dusdc_amount: u64,
    hedge_payout_amount: u64,
    dusdc_amount: u64,
    claimed_at_ms: u64,
}

public struct ShieldSettled has copy, drop {
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
    plp_dusdc_amount: u64,
    hedge_payout_amount: u64,
    dusdc_amount: u64,
    settled_at_ms: u64,
}

public struct ShieldBeneficiaryUpdated has copy, drop {
    policy_id: ID,
    owner_cap_id: ID,
    old_beneficiary: address,
    new_beneficiary: address,
}

public fun open(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    payment: Coin<DUSDC>,
    beneficiary: address,
    hedge_budget_amount: u64,
    max_loss_bps: u16,
    hedge_strike: u64,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (ShieldOwnerCap, Coin<DUSDC>) {
    let (plp, deposit_amount, hedge_expiry_ms, hedge_cost, hedge_refund_amount, refund) = hedge::open(
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
    let (cap, policy_id, owner_cap_id, plp_amount, created_at_ms) = policy::new_shared(
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

    event::emit(ShieldOpened {
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

public fun set_beneficiary(
    policy: &mut ShieldPolicy,
    cap: &ShieldOwnerCap,
    new_beneficiary: address,
) {
    let old_beneficiary = policy::set_beneficiary(policy, cap, new_beneficiary);
    event::emit(ShieldBeneficiaryUpdated {
        policy_id: policy::id(policy),
        owner_cap_id: policy::owner_cap_id(cap),
        old_beneficiary,
        new_beneficiary,
    });
}

public fun claim(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    policy: &mut ShieldPolicy,
    cap: ShieldOwnerCap,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<DUSDC> {
    assert_bindings(policy, predict, manager, oracle);
    policy::assert_owner_cap(policy, &cap);
    policy::assert_unsettled(policy);
    let (hedge_payout_amount, mut payout) = hedge::redeem_and_withdraw(
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
    let owner_cap_id = policy::destroy_owner_cap(cap, policy::id(policy));
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
    ) = policy::settle_and_take_plp(policy, clock);
    let plp = coin::from_balance(plp_balance, ctx);
    let plp_dusdc = predict::withdraw<DUSDC>(predict, plp, clock, ctx);
    let plp_dusdc_amount = plp_dusdc.value();
    payout.join(plp_dusdc);
    let dusdc_amount = payout.value();

    event::emit(ShieldClaimed {
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
        plp_dusdc_amount,
        hedge_payout_amount,
        dusdc_amount,
        claimed_at_ms,
    });

    payout
}

/// Permissionless maturity settlement for keepers.
///
/// The hedge payout is redeemed into the user's PredictManager. The deployed
/// PredictManager only lets its owner withdraw, so this transfers the PLP
/// withdrawal to the policy beneficiary and reports the manager payout delta.
public fun settle(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    policy: &mut ShieldPolicy,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_bindings(policy, predict, manager, oracle);
    policy::assert_unsettled(policy);
    let hedge_payout_amount = hedge::redeem_to_manager(
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
    ) = policy::settle_and_take_plp(policy, clock);
    let plp = coin::from_balance(plp_balance, ctx);
    let payout = predict::withdraw<DUSDC>(predict, plp, clock, ctx);
    let plp_dusdc_amount = payout.value();
    let dusdc_amount = payout.value();

    event::emit(ShieldSettled {
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
        plp_dusdc_amount,
        hedge_payout_amount,
        dusdc_amount,
        settled_at_ms,
    });

    transfer::public_transfer(payout, beneficiary);
}

fun assert_bindings(
    policy: &ShieldPolicy,
    predict: &Predict,
    manager: &PredictManager,
    oracle: &OracleSVI,
) {
    policy::assert_predict(policy, object::id(predict));
    policy::assert_manager(policy, object::id(manager));
    policy::assert_oracle(policy, oracle::id(oracle));
}
