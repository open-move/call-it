/// Binary DOWN Predict hedge operations for Shield.
module shield::hedge;

use sui::{
    clock::Clock,
    coin::{Self, Coin},
    object::{Self, ID},
};

use deepbook_predict::{
    market_key,
    oracle::{Self, OracleSVI},
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
const EInvalidHedgeQuantity: vector<u8> = b"Hedge quantity must be non-zero";

#[error]
const EInvalidHedgeStrike: vector<u8> = b"DOWN hedge strike must be below current spot";

#[error]
const EOracleNotActive: vector<u8> = b"Oracle must be active when opening a policy";

#[error]
const EOracleNotSettled: vector<u8> = b"Oracle must be settled before settling a policy";

#[error]
const ENotManagerOwner: vector<u8> = b"Only the PredictManager owner can open or fully claim a policy";

#[error]
const EExceededHedgeBudget: vector<u8> = b"Hedge mint exceeded hedge budget";

#[error]
const EInvalidHedgePayout: vector<u8> = b"Hedge redeem reduced manager balance";

#[error]
const EHedgePositionChanged: vector<u8> = b"Shield hedge position was changed outside the policy";

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
): (Coin<PLP>, u64, u64, u64, u64, Coin<Quote>) {
    let deposit_amount = payment.value();

    assert!(predict_manager::owner(manager) == ctx.sender(), ENotManagerOwner);
    assert!(hedge_budget_amount > 0 && hedge_budget_amount < deposit_amount, EInvalidHedgeBudget);
    assert_budget(deposit_amount, hedge_budget_amount, max_loss_bps);
    assert!(hedge_quantity > 0, EInvalidHedgeQuantity);
    assert!(oracle::status(oracle, clock) == oracle::status_active(), EOracleNotActive);
    assert!(hedge_strike < oracle::spot_price(oracle), EInvalidHedgeStrike);

    let hedge_expiry_ms = oracle::expiry(oracle);
    let key = market_key::new(oracle::id(oracle), hedge_expiry_ms, hedge_strike, false);
    assert_hedge_position(manager, key, 0);

    let hedge_budget = payment.split(hedge_budget_amount, ctx);
    let balance_before = predict_manager::balance<Quote>(manager);
    predict_manager::deposit<Quote>(manager, hedge_budget, ctx);
    let balance_after_deposit = predict_manager::balance<Quote>(manager);
    predict::mint<Quote>(predict, manager, oracle, key, hedge_quantity, clock, ctx);
    assert_hedge_position(manager, key, hedge_quantity);
    let balance_after_mint = predict_manager::balance<Quote>(manager);
    assert!(balance_after_mint >= balance_before, EExceededHedgeBudget);
    let hedge_cost = balance_after_deposit - balance_after_mint;
    let hedge_refund_amount = balance_after_mint - balance_before;
    let refund = if (hedge_refund_amount > 0) {
        predict_manager::withdraw<Quote>(manager, hedge_refund_amount, ctx)
    } else {
        coin::zero(ctx)
    };
    let plp = predict::supply<Quote>(predict, payment, clock, ctx);

    (plp, deposit_amount, hedge_expiry_ms, hedge_cost, hedge_refund_amount, refund)
}

public(package) fun redeem_to_manager<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    oracle_id: ID,
    hedge_expiry_ms: u64,
    hedge_strike: u64,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    assert!(oracle::status(oracle, clock) == oracle::status_settled(), EOracleNotSettled);
    let key = market_key::new(oracle_id, hedge_expiry_ms, hedge_strike, false);
    assert_hedge_position(manager, key, hedge_quantity);
    let manager_balance_before = predict_manager::balance<Quote>(manager);
    predict::redeem_permissionless<Quote>(predict, manager, oracle, key, hedge_quantity, clock, ctx);
    assert_hedge_position(manager, key, 0);
    let manager_balance_after = predict_manager::balance<Quote>(manager);
    assert!(manager_balance_after >= manager_balance_before, EInvalidHedgePayout);
    manager_balance_after - manager_balance_before
}

public(package) fun redeem_and_withdraw<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    oracle_id: ID,
    hedge_expiry_ms: u64,
    hedge_strike: u64,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (u64, Coin<Quote>) {
    assert!(predict_manager::owner(manager) == ctx.sender(), ENotManagerOwner);
    let payout_amount = redeem_to_manager<Quote>(
        predict,
        manager,
        oracle,
        oracle_id,
        hedge_expiry_ms,
        hedge_strike,
        hedge_quantity,
        clock,
        ctx,
    );
    let payout = if (payout_amount > 0) {
        predict_manager::withdraw<Quote>(manager, payout_amount, ctx)
    } else {
        coin::zero(ctx)
    };
    (payout_amount, payout)
}

fun assert_hedge_position(
    manager: &PredictManager,
    key: market_key::MarketKey,
    expected_quantity: u64,
) {
    assert!(predict_manager::position(manager, key) == expected_quantity, EHedgePositionChanged);
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
