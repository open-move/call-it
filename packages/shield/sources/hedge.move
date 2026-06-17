/// Binary DOWN Predict hedge operations for Shield.
module shield::hedge;

use sui::{
    balance::Balance,
    clock::Clock,
    coin::{Self, Coin},
};

use deepbook_predict::{
    market_key::{Self, MarketKey},
    oracle::OracleSVI,
    plp::PLP,
    predict::{Self, Predict},
    predict_manager::{Self, PredictManager},
};

const BPS_DENOMINATOR: u128 = 10000;
const MAX_LOSS_BPS: u16 = 5000;

#[error]
const EInvalidHedgeBudget: vector<u8> = b"Hedge budget must be less than the deposit";

#[error]
const EInvalidMaxLossBps: vector<u8> = b"Max loss bps must be within the protocol limit";

#[error]
const EInvalidHedgeStrike: vector<u8> = b"DOWN hedge strike must be below current spot";

#[error]
const ENotManagerOwner: vector<u8> = b"Only the PredictManager owner can open or fully claim a policy";

#[error]
const EExceededHedgeBudget: vector<u8> = b"Hedge mint exceeded hedge budget";

#[error]
const EHedgePositionChanged: vector<u8> = b"Shield hedge position was changed outside the policy";

public struct HedgeOpenReceipt<phantom Quote> {
    plp_balance: Balance<PLP>,
    refund_balance: Balance<Quote>,
    key: MarketKey,
}

public struct HedgeWithdrawReceipt<phantom Quote> {
    payout_amount: u64,
    payout_balance: Balance<Quote>,
}

public(package) fun open<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    mut payment: Coin<Quote>,
    hedge_budget_amount: u64,
    max_loss_bps: u16,
    hedge_strike: u64,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): HedgeOpenReceipt<Quote> {
    let deposit_amount = payment.value();

    assert!(hedge_budget_amount > 0 && hedge_budget_amount < deposit_amount, EInvalidHedgeBudget);
    assert_budget(deposit_amount, hedge_budget_amount, max_loss_bps);
    assert!(hedge_strike < oracle.spot_price(), EInvalidHedgeStrike);

    let key = market_key::new(oracle.id(), oracle.expiry(), hedge_strike, false);
    assert_hedge_position(manager, key, 0);

    let balance_before = manager.balance<Quote>();
    manager.deposit<Quote>(payment.split(hedge_budget_amount, ctx), ctx);
    predict.mint<Quote>(manager, oracle, key, hedge_quantity, clock, ctx);
    let balance_after_mint = manager.balance<Quote>();
    assert!(balance_after_mint >= balance_before, EExceededHedgeBudget);
    let hedge_refund_amount = balance_after_mint - balance_before;
    let refund = if (hedge_refund_amount > 0) {
        manager.withdraw<Quote>(hedge_refund_amount, ctx)
    } else {
        coin::zero(ctx)
    };

    HedgeOpenReceipt {
        plp_balance: predict.supply<Quote>(payment, clock, ctx).into_balance(),
        refund_balance: refund.into_balance(),
        key,
    }
}

public(package) fun take_plp<Quote>(receipt: &mut HedgeOpenReceipt<Quote>, ctx: &mut TxContext): Coin<PLP> {
    let plp_amount = receipt.plp_balance.value();
    coin::from_balance(receipt.plp_balance.split(plp_amount), ctx)
}

public(package) fun key<Quote>(receipt: &HedgeOpenReceipt<Quote>): MarketKey {
    receipt.key
}

public(package) fun into_refund<Quote>(receipt: HedgeOpenReceipt<Quote>, ctx: &mut TxContext): Coin<Quote> {
    let HedgeOpenReceipt {
        plp_balance,
        refund_balance,
        key: _,
    } = receipt;
    plp_balance.destroy_zero();
    coin::from_balance(refund_balance, ctx)
}

public(package) fun redeem_to_manager<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    assert_hedge_position(manager, key, quantity);
    let manager_balance_before = manager.balance<Quote>();
    predict.redeem_permissionless<Quote>(manager, oracle, key, quantity, clock, ctx);
    let manager_balance_after = manager.balance<Quote>();
    manager_balance_after - manager_balance_before
}

public(package) fun redeem_and_withdraw<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): HedgeWithdrawReceipt<Quote> {
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    let payout_amount = redeem_to_manager<Quote>(
        predict,
        manager,
        oracle,
        key,
        quantity,
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

public(package) fun payout_amount<Quote>(receipt: &HedgeWithdrawReceipt<Quote>): u64 {
    receipt.payout_amount
}

public(package) fun into_payout<Quote>(receipt: HedgeWithdrawReceipt<Quote>, ctx: &mut TxContext): Coin<Quote> {
    let HedgeWithdrawReceipt { payout_amount: _, payout_balance } = receipt;
    coin::from_balance(payout_balance, ctx)
}

fun assert_hedge_position(
    manager: &PredictManager,
    key: MarketKey,
    expected_quantity: u64,
) {
    assert!(manager.position(key) == expected_quantity, EHedgePositionChanged);
}

fun assert_budget(
    deposit_amount: u64,
    hedge_budget_amount: u64,
    max_loss_bps: u16,
) {
    assert!(max_loss_bps > 0 && max_loss_bps <= MAX_LOSS_BPS, EInvalidMaxLossBps);
    let allowed = (deposit_amount as u128) * (max_loss_bps as u128) / BPS_DENOMINATOR;
    assert!((hedge_budget_amount as u128) <= allowed, EInvalidHedgeBudget);
}
