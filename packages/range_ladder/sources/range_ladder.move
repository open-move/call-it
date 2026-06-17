/// Range Ladder structured product claim-ticket facade.
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
    range_key::{Self, RangeKey},
};

use range_ladder::policy::{Self, RangeLadderPolicy, RangePosition, RangeRung};

#[error]
const EInvalidPremium: vector<u8> = b"Premium must be non-zero";

#[error]
const EOracleNotSettled: vector<u8> = b"Oracle must be settled before claiming a range ladder";

#[error]
const EExceededPremium: vector<u8> = b"Range ladder mint exceeded premium";

#[error]
const EInvalidRangePayout: vector<u8> = b"Range redeem reduced manager balance";

#[error]
const ERangePositionChanged: vector<u8> = b"Range ladder position was changed outside the policy";

public struct RangeLadderOpened<phantom Quote> has copy, drop {
    policy_id: ID,
    created_at_ms: u64,
}

public struct RangeLadderClaimed<phantom Quote> has copy, drop {
    policy_id: ID,
    payout_amount: u64,
    claimed_at_ms: u64,
}

public fun open<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    payment: Coin<Quote>,
    rungs: vector<RangeRung>,
    clock: &Clock,
    ctx: &mut TxContext,
): (RangeLadderPolicy<Quote>, Coin<Quote>) {
    policy::assert_valid_rungs(&rungs);

    let premium_amount = payment.value();
    assert!(premium_amount > 0, EInvalidPremium);
    let balance_before = manager.balance<Quote>();
    manager.deposit<Quote>(payment, ctx);

    let balance_after_deposit = manager.balance<Quote>();
    let positions = mint_ranges<Quote>(predict, manager, oracle, oracle.id(), oracle.expiry(), rungs, clock, ctx);
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
    let policy = policy::new<Quote>(
        premium_amount,
        object::id(predict),
        object::id(manager),
        positions,
        total_cost,
        clock,
        ctx,
    );

    event::emit(RangeLadderOpened<Quote> {
        policy_id: policy.id(),
        created_at_ms: policy.created_at_ms(),
    });

    (policy, refund)
}

public fun claim<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    policy: RangeLadderPolicy<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert_bindings<Quote>(&policy, predict, manager, oracle);
    let payout_amount = redeem_ranges_to_manager<Quote>(
        predict,
        manager,
        oracle,
        policy.positions(),
        clock,
        ctx,
    );
    let payout = if (payout_amount > 0) {
        manager.withdraw<Quote>(payout_amount, ctx)
    } else {
        coin::zero(ctx)
    };
    let policy_id = policy::destroy(policy);
    let claimed_at_ms = clock.timestamp_ms();

    event::emit(RangeLadderClaimed<Quote> {
        policy_id,
        payout_amount,
        claimed_at_ms,
    });

    payout
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
): vector<RangePosition> {
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
        minted.push_back(policy::new_position(key, rung.quantity(), balance_before - balance_after));
    });
    minted
}

fun redeem_ranges_to_manager<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    positions: vector<RangePosition>,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    assert!(oracle.status(clock) == oracle::status_settled(), EOracleNotSettled);
    let balance_before = manager.balance<Quote>();

    positions.do!(|position| {
        let key = position.position_key();
        let quantity = position.position_quantity();
        assert_range_position(manager, key, quantity);
        predict.redeem_range<Quote>(manager, oracle, key, quantity, clock, ctx);
    });

    let balance_after = manager.balance<Quote>();
    assert!(balance_after >= balance_before, EInvalidRangePayout);
    balance_after - balance_before
}

fun assert_range_position(
    manager: &PredictManager,
    key: RangeKey,
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
