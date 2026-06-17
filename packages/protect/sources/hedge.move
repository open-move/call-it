/// Predict hedge operations for Protect policies.
module protect::hedge;

use sui::{
    balance::Balance,
    clock::Clock,
    coin::{Self, Coin},
    object::{Self, ID},
};

use deepbook_predict::{
    market_key,
    oracle::OracleSVI,
    predict::{Self, Predict},
    predict_manager::{Self, PredictManager},
};

#[error]
const EInvalidPremium: vector<u8> = b"Premium must be non-zero";

#[error]
const EInvalidHedgeStrike: vector<u8> = b"UP hedge strike must be above spot and DOWN hedge strike below spot";

#[error]
const ENotManagerOwner: vector<u8> = b"Only the PredictManager owner can open or fully claim a protection policy";

#[error]
const EExceededPremium: vector<u8> = b"Hedge mint exceeded protection premium";

#[error]
const EProtectionPositionChanged: vector<u8> = b"Protection hedge position was changed outside the policy";

public(package) fun open<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    payment: Coin<Quote>,
    hedge_strike: u64,
    hedge_is_up: bool,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): HedgeOpenReceipt<Quote> {
    let premium_amount = payment.value();

    assert!(premium_amount > 0, EInvalidPremium);
    assert_valid_strike(oracle, hedge_strike, hedge_is_up);

    let hedge_expiry_ms = oracle.expiry();
    let key = market_key::new(oracle.id(), hedge_expiry_ms, hedge_strike, hedge_is_up);
    assert_hedge_position(manager, key, 0);

    let balance_before = manager.balance<Quote>();
    manager.deposit<Quote>(payment, ctx);
    let balance_after_deposit = manager.balance<Quote>();
    predict.mint<Quote>(manager, oracle, key, hedge_quantity, clock, ctx);
    let balance_after_mint = manager.balance<Quote>();
    assert!(balance_after_mint >= balance_before, EExceededPremium);
    let hedge_cost = balance_after_deposit - balance_after_mint;
    let refund_amount = balance_after_mint - balance_before;
    let refund = if (refund_amount > 0) {
        manager.withdraw<Quote>(refund_amount, ctx)
    } else {
        coin::zero(ctx)
    };

    HedgeOpenReceipt {
        premium_amount,
        hedge_expiry_ms,
        hedge_cost,
        refund_balance: refund.into_balance(),
    }
}

public struct HedgeOpenReceipt<phantom Quote> {
    premium_amount: u64,
    hedge_expiry_ms: u64,
    hedge_cost: u64,
    refund_balance: Balance<Quote>,
}

public(package) fun premium_amount<Quote>(receipt: &HedgeOpenReceipt<Quote>): u64 {
    receipt.premium_amount
}

public(package) fun hedge_expiry_ms<Quote>(receipt: &HedgeOpenReceipt<Quote>): u64 {
    receipt.hedge_expiry_ms
}

public(package) fun hedge_cost<Quote>(receipt: &HedgeOpenReceipt<Quote>): u64 {
    receipt.hedge_cost
}

public(package) fun into_refund<Quote>(receipt: HedgeOpenReceipt<Quote>, ctx: &mut TxContext): Coin<Quote> {
    let HedgeOpenReceipt { premium_amount: _, hedge_expiry_ms: _, hedge_cost: _, refund_balance } = receipt;
    coin::from_balance(refund_balance, ctx)
}

public(package) fun redeem_to_manager<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    oracle_id: ID,
    hedge_expiry_ms: u64,
    hedge_strike: u64,
    hedge_is_up: bool,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    let key = market_key::new(oracle_id, hedge_expiry_ms, hedge_strike, hedge_is_up);
    assert_hedge_position(manager, key, hedge_quantity);
    let manager_balance_before = manager.balance<Quote>();
    predict.redeem_permissionless<Quote>(manager, oracle, key, hedge_quantity, clock, ctx);
    let manager_balance_after = manager.balance<Quote>();
    manager_balance_after - manager_balance_before
}

public(package) fun redeem_and_withdraw<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    oracle_id: ID,
    hedge_expiry_ms: u64,
    hedge_strike: u64,
    hedge_is_up: bool,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): HedgeWithdrawReceipt<Quote> {
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    let payout_amount = redeem_to_manager<Quote>(
        predict,
        manager,
        oracle,
        oracle_id,
        hedge_expiry_ms,
        hedge_strike,
        hedge_is_up,
        hedge_quantity,
        clock,
        ctx,
    );
    let payout = if (payout_amount > 0) {
        manager.withdraw<Quote>(payout_amount, ctx)
    } else {
        coin::zero(ctx)
    };
    
    HedgeWithdrawReceipt { payout_amount, payout_balance: payout.into_balance() }
}

public struct HedgeWithdrawReceipt<phantom Quote> {
    payout_amount: u64,
    payout_balance: Balance<Quote>,
}

public(package) fun payout_amount<Quote>(receipt: &HedgeWithdrawReceipt<Quote>): u64 {
    receipt.payout_amount
}

public(package) fun into_payout<Quote>(receipt: HedgeWithdrawReceipt<Quote>, ctx: &mut TxContext): Coin<Quote> {
    let HedgeWithdrawReceipt { payout_amount: _, payout_balance } = receipt;
    coin::from_balance(payout_balance, ctx)
}

fun assert_valid_strike(oracle: &OracleSVI, hedge_strike: u64, hedge_is_up: bool) {
    let spot = oracle.spot_price();
    if (hedge_is_up) {
        assert!(hedge_strike > spot, EInvalidHedgeStrike);
    } else {
        assert!(hedge_strike < spot, EInvalidHedgeStrike);
    }
}

fun assert_hedge_position(
    manager: &PredictManager,
    key: market_key::MarketKey,
    expected_quantity: u64,
) {
    assert!(manager.position(key) == expected_quantity, EProtectionPositionChanged);
}
