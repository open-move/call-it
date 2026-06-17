/// Range Ladder structured product receipt and lifecycle facade.
module range_ladder::range_ladder;

use sui::{
    clock::Clock,
    coin::{Self, Coin},
    event,
    object::{Self, ID},
};

use deepbook_predict::{
    oracle::{Self, OracleSVI},
    predict::{Self, Predict},
    predict_manager::{Self, PredictManager},
    range_key,
};

use range_ladder::policy::{Self, RangeLadderOwnerCap, RangeLadderPolicy, RangeRung};

#[error]
const EInvalidPremium: vector<u8> = b"Premium must be non-zero";

#[error]
const EOracleNotSettled: vector<u8> = b"Oracle must be settled before settling a range ladder";

#[error]
const EExceededPremium: vector<u8> = b"Range ladder mint exceeded premium";

#[error]
const EInvalidRangePayout: vector<u8> = b"Range redeem reduced manager balance";

#[error]
const ERangePositionChanged: vector<u8> = b"Range ladder position was changed outside the policy";

public struct RangeLadderOpened<phantom Quote> has copy, drop {
    policy_id: ID,
    owner_cap_id: ID,
    created_at_ms: u64,
}

public struct RangeLadderClaimed<phantom Quote> has copy, drop {
    policy_id: ID,
    owner_cap_id: ID,
    payout_amount: u64,
    claimed_at_ms: u64,
}

public struct RangeLadderSettled<phantom Quote> has copy, drop {
    policy_id: ID,
    manager_payout_amount: u64,
    settled_at_ms: u64,
}

public struct RangeLadderOwnerCapBurned<phantom Quote> has copy, drop {
    policy_id: ID,
    owner_cap_id: ID,
    burned_at_ms: u64,
}

public struct RangeLadderBeneficiaryUpdated<phantom Quote> has copy, drop {
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
    rungs: vector<RangeRung>,
    clock: &Clock,
    ctx: &mut TxContext,
): (RangeLadderOwnerCap<Quote>, Coin<Quote>) {
    policy::assert_valid_beneficiary(beneficiary);
    policy::assert_valid_rungs(&rungs);

    let premium_amount = payment.value();
    assert!(premium_amount > 0, EInvalidPremium);
    let balance_before = manager.balance<Quote>();
    manager.deposit<Quote>(payment, ctx);

    let balance_after_deposit = manager.balance<Quote>();
    let expiry_ms = oracle.expiry();
    let oracle_id = oracle.id();
    let rungs_with_cost = mint_ranges<Quote>(predict, manager, oracle, oracle_id, expiry_ms, rungs, clock, ctx);
    let balance_after_mint = manager.balance<Quote>();
    assert!(balance_after_mint <= balance_after_deposit, EExceededPremium);
    assert!(balance_after_mint >= balance_before, EExceededPremium);
    let total_cost = balance_after_deposit - balance_after_mint;
    let refund_amount = balance_after_mint - balance_before;
    let refund = if (refund_amount > 0) {
        manager.withdraw<Quote>(refund_amount, ctx)
    } else {
        coin::zero(ctx)
    };
    let (policy, cap) = policy::new<Quote>(
        beneficiary,
        premium_amount,
        object::id(predict),
        object::id(manager),
        oracle_id,
        expiry_ms,
        total_cost,
        rungs_with_cost,
        clock,
        ctx,
    );

    event::emit(RangeLadderOpened<Quote> {
        policy_id: policy.id(),
        owner_cap_id: cap.owner_cap_id(),
        created_at_ms: policy.created_at_ms(),
    });
    policy::share(policy);

    (cap, refund)
}

public fun set_beneficiary<Quote>(
    policy: &mut RangeLadderPolicy<Quote>,
    cap: &RangeLadderOwnerCap<Quote>,
    new_beneficiary: address,
) {
    let old_beneficiary = policy.set_beneficiary(cap, new_beneficiary);
    event::emit(RangeLadderBeneficiaryUpdated<Quote> {
        policy_id: policy.id(),
        old_beneficiary,
        new_beneficiary,
    });
}

public fun claim<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    policy: &mut RangeLadderPolicy<Quote>,
    cap: RangeLadderOwnerCap<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert_bindings<Quote>(policy, predict, manager, oracle);
    policy.assert_owner_cap(&cap);
    if (policy.settled()) {
        let policy_id = policy.id();
        let owner_cap_id = cap.destroy_owner_cap(policy_id);
        event::emit(RangeLadderOwnerCapBurned<Quote> {
            policy_id,
            owner_cap_id,
            burned_at_ms: clock.timestamp_ms(),
        });
        return coin::zero(ctx)
    };
    policy.assert_unsettled();
    let payout_amount = redeem_ranges_to_manager<Quote>(
        predict,
        manager,
        oracle,
        policy.oracle_id(),
        policy.expiry_ms(),
        policy.rungs(),
        clock,
        ctx,
    );
    let payout = if (payout_amount > 0) {
        manager.withdraw<Quote>(payout_amount, ctx)
    } else {
        coin::zero(ctx)
    };
    let policy_id = policy.id();
    let owner_cap_id = cap.destroy_owner_cap(policy_id);
    let claimed_at_ms = policy.mark_settled(clock);

    event::emit(RangeLadderClaimed<Quote> {
        policy_id,
        owner_cap_id,
        payout_amount,
        claimed_at_ms,
    });

    payout
}

/// Owner-only settlement into the user's PredictManager.
///
/// DeepBook Predict does not expose permissionless range redemption, so this
/// function requires the PredictManager owner and reports the manager payout
/// delta instead of withdrawing the funds.
public fun settle<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    policy: &mut RangeLadderPolicy<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_bindings<Quote>(policy, predict, manager, oracle);
    policy.assert_unsettled();
    let manager_payout_amount = redeem_ranges_to_manager<Quote>(
        predict,
        manager,
        oracle,
        policy.oracle_id(),
        policy.expiry_ms(),
        policy.rungs(),
        clock,
        ctx,
    );
    let policy_id = policy.id();
    let settled_at_ms = policy.mark_settled(clock);

    event::emit(RangeLadderSettled<Quote> {
        policy_id,
        manager_payout_amount,
        settled_at_ms,
    });
}

fun mint_ranges<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    oracle_id: ID,
    expiry_ms: u64,
    rungs: vector<RangeRung>,
    clock: &Clock,
    ctx: &mut TxContext,
): vector<RangeRung> {
    let mut minted = vector[];
    rungs.do!(|rung| {
        let key = range_key::new(
            oracle_id,
            expiry_ms,
            rung.lower_strike(),
            rung.higher_strike(),
        );
        assert_range_position(manager, key, 0);
        let balance_before = manager.balance<Quote>();
        predict.mint_range<Quote>(manager, oracle, key, rung.quantity(), clock, ctx);
        let balance_after = manager.balance<Quote>();
        assert!(balance_after <= balance_before, EExceededPremium);
        minted.push_back(policy::new_rung_with_cost(
            rung.lower_strike(),
            rung.higher_strike(),
            rung.quantity(),
            balance_before - balance_after,
        ));
    });
    minted
}

fun redeem_ranges_to_manager<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    oracle_id: ID,
    expiry_ms: u64,
    rungs: vector<RangeRung>,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    assert!(oracle.status(clock) == oracle::status_settled(), EOracleNotSettled);
    let balance_before = manager.balance<Quote>();

    rungs.do!(|rung| {
        let key = range_key::new(
            oracle_id,
            expiry_ms,
            rung.lower_strike(),
            rung.higher_strike(),
        );
        assert_range_position(manager, key, rung.quantity());
        predict.redeem_range<Quote>(manager, oracle, key, rung.quantity(), clock, ctx);
    });

    let balance_after = manager.balance<Quote>();
    assert!(balance_after >= balance_before, EInvalidRangePayout);
    balance_after - balance_before
}

fun assert_range_position(
    manager: &PredictManager,
    key: range_key::RangeKey,
    expected_quantity: u64,
) {
    assert!(manager.range_position(key) == expected_quantity, ERangePositionChanged);
}

fun assert_bindings<Quote>(
    policy: &RangeLadderPolicy<Quote>,
    predict: &Predict,
    manager: &PredictManager,
    oracle: &OracleSVI,
) {
    policy.assert_predict(object::id(predict));
    policy.assert_manager(object::id(manager));
    policy.assert_oracle(oracle.id());
}
