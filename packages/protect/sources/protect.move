/// Standalone Predict hedge policy facade.
module protect::protect;

use sui::{
    clock::Clock,
    coin::{Self, Coin},
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
    policy::{Self, ProtectionOwnerCap, ProtectionPolicy},
};

public struct ProtectionOpened<phantom Quote> has copy, drop {
    policy_id: ID,
    owner_cap_id: ID,
    created_at_ms: u64,
}

public struct ProtectionClaimed<phantom Quote> has copy, drop {
    policy_id: ID,
    owner_cap_id: ID,
    claimed_at_ms: u64,
    hedge_payout_amount: u64,
}

public struct ProtectionSettled<phantom Quote> has copy, drop {
    policy_id: ID,
    manager_payout_amount: u64,
    settled_at_ms: u64,
}

public struct ProtectionOwnerCapBurned<phantom Quote> has copy, drop {
    policy_id: ID,
    owner_cap_id: ID,
    burned_at_ms: u64,
}

public struct ProtectionBeneficiaryUpdated<phantom Quote> has copy, drop {
    policy_id: ID,
    old_beneficiary: address,
    new_beneficiary: address,
}

public fun open<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    payment: Coin<Quote>,
    beneficiary: address,
    hedge_strike: u64,
    hedge_is_up: bool,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (ProtectionOwnerCap<Quote>, Coin<Quote>) {
    policy::assert_valid_beneficiary(beneficiary);
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
    let (policy, cap) = policy::new<Quote>(
        beneficiary,
        hedge::premium_amount(&hedge_receipt),
        object::id(predict),
        object::id(manager),
        oracle.id(),
        hedge::hedge_expiry_ms(&hedge_receipt),
        hedge_strike,
        hedge_is_up,
        hedge_quantity,
        hedge::hedge_cost(&hedge_receipt),
        clock,
        ctx,
    );

    event::emit(ProtectionOpened<Quote> {
        policy_id: policy.id(),
        owner_cap_id: cap.owner_cap_id(),
        created_at_ms: policy.created_at_ms(),
    });
    policy::share(policy);

    (cap, hedge::into_refund(hedge_receipt, ctx))
}

public fun set_beneficiary<Quote>(
    policy: &mut ProtectionPolicy<Quote>,
    cap: &ProtectionOwnerCap<Quote>,
    new_beneficiary: address,
) {
    let old_beneficiary = policy.set_beneficiary(cap, new_beneficiary);
    event::emit(ProtectionBeneficiaryUpdated<Quote> {
        policy_id: policy.id(),
        old_beneficiary,
        new_beneficiary,
    });
}

public fun claim<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    policy: &mut ProtectionPolicy<Quote>,
    cap: ProtectionOwnerCap<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert_bindings<Quote>(policy, predict, manager, oracle);
    policy.assert_owner_cap(&cap);
    if (policy.settled()) {
        let policy_id = policy.id();
        let owner_cap_id = cap.destroy_owner_cap(policy_id);
        event::emit(ProtectionOwnerCapBurned<Quote> {
            policy_id,
            owner_cap_id,
            burned_at_ms: clock.timestamp_ms(),
        });
        return coin::zero(ctx)
    };
    policy.assert_unsettled();
    let hedge_receipt = hedge::redeem_and_withdraw<Quote>(
        predict,
        manager,
        oracle,
        policy.oracle_id(),
        policy.hedge_expiry_ms(),
        policy.hedge_strike(),
        policy.hedge_is_up(),
        policy.hedge_quantity(),
        clock,
        ctx,
    );
    let hedge_payout_amount = hedge::payout_amount(&hedge_receipt);
    let policy_id = policy.id();
    let owner_cap_id = cap.destroy_owner_cap(policy_id);
    let claimed_at_ms = policy.mark_settled(clock);

    event::emit(ProtectionClaimed<Quote> {
        policy_id,
        owner_cap_id,
        hedge_payout_amount,
        claimed_at_ms,
    });

    hedge::into_payout(hedge_receipt, ctx)
}

/// Permissionless maturity settlement for keepers.
///
/// The hedge payout is redeemed into the user's PredictManager. The deployed
/// PredictManager only lets its owner withdraw, so this reports the manager
/// payout delta rather than transferring payout funds.
public fun settle<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    policy: &mut ProtectionPolicy<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_bindings<Quote>(policy, predict, manager, oracle);
    policy.assert_unsettled();
    let manager_payout_amount = hedge::redeem_to_manager<Quote>(
        predict,
        manager,
        oracle,
        policy.oracle_id(),
        policy.hedge_expiry_ms(),
        policy.hedge_strike(),
        policy.hedge_is_up(),
        policy.hedge_quantity(),
        clock,
        ctx,
    );
    let policy_id = policy.id();
    let settled_at_ms = policy.mark_settled(clock);

    event::emit(ProtectionSettled<Quote> {
        policy_id,
        manager_payout_amount,
        settled_at_ms,
    });
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
