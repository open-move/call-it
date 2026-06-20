/// Managed Range Ladder strategy using true DeepBook Predict RangeKey positions.
module range_ladder_strategy::range_ladder_strategy;

use std::option::{Self, Option};
use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin, TreasuryCap},
    event,
    object::{Self, ID, UID},
    transfer,
};

use deepbook_predict::{
    oracle::{Self, OracleSVI},
    predict::{Predict},
    predict_manager::PredictManager,
    range_key::{Self, RangeKey},
};

use base_vault::base_vault::{Self, BASE_VAULT, BaseVault};
use range_ladder_strategy::policy::{Self, RangeLadderPolicy, RangePosition, RangeRung};

const BPS_DENOMINATOR: u64 = 10_000;

const EPaused: u64 = 1;
const EWrongStrategyCap: u64 = 2;
const ERoundAlreadyActive: u64 = 3;
const ENoActiveRound: u64 = 4;
const EWrongManager: u64 = 5;
const ENotManagerOwner: u64 = 6;
const EManagerNotDedicated: u64 = 7;
const EOracleNotActive: u64 = 8;
const EOracleNotSettled: u64 = 9;
const EWrongPredict: u64 = 10;
const EWrongOracle: u64 = 11;
const EInvalidPremiumBudget: u64 = 12;
const ECashLow: u64 = 13;
const EZeroDeposit: u64 = 14;
const EZeroShares: u64 = 15;
const ERangeAskAboveCeiling: u64 = 16;
const EExceededPremiumBudget: u64 = 17;
const ERangePositionChanged: u64 = 18;
const EInvalidRangePayout: u64 = 19;
const EWrongBaseVault: u64 = 20;

public struct RANGE_LADDER_STRATEGY has drop {}

public struct RangeRound has copy, drop, store {
    predict_id: ID,
    oracle_id: ID,
    positions: vector<RangePosition>,
}

public struct RangeLadderStrategy<phantom Quote> has key {
    id: UID,
    treasury: TreasuryCap<RANGE_LADDER_STRATEGY>,
    base_vault_id: ID,
    base_shares: Balance<BASE_VAULT>,
    cash: Balance<Quote>,
    manager_id: ID,
    active_round: Option<RangeRound>,
    policy: RangeLadderPolicy,
    paused: bool,
}

public struct StrategyCap has key, store {
    id: UID,
    strategy_id: ID,
}

public struct RangeLadderStrategyCreated has copy, drop {
    strategy_id: ID,
    base_vault_id: ID,
    manager_id: ID,
    cap_id: ID,
}

public struct RangeLadderDeposited has copy, drop {
    strategy_id: ID,
    depositor: address,
    amount: u64,
    shares_minted: u64,
    nav_before: u64,
}

public struct RangeLadderWithdrawn has copy, drop {
    strategy_id: ID,
    owner: address,
    shares_burned: u64,
    amount_out: u64,
    nav_before: u64,
}

public struct RangeRoundStarted has copy, drop {
    strategy_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    premium_budget_amount: u64,
    total_premium_spent: u64,
    refund_amount: u64,
    reserve_amount: u64,
    range_count: u64,
}

public struct RangeRoundSettled has copy, drop {
    strategy_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    payout_swept: u64,
    nav_after_settle: u64,
}

#[allow(deprecated_usage)]
fun init(witness: RANGE_LADDER_STRATEGY, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"cRANGE",
        b"CallIt Range Ladder Strategy Share",
        b"Tokenized share of the CallIt Range Ladder strategy.",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}

public fun create_strategy<Quote>(
    treasury: TreasuryCap<RANGE_LADDER_STRATEGY>,
    base: &BaseVault<Quote>,
    manager: &PredictManager,
    policy: RangeLadderPolicy,
    ctx: &mut TxContext,
): (RangeLadderStrategy<Quote>, StrategyCap) {
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    let base_vault_id = base.id();
    let manager_id = object::id(manager);
    let strategy = RangeLadderStrategy<Quote> {
        id: object::new(ctx),
        treasury,
        base_vault_id,
        base_shares: balance::zero(),
        cash: balance::zero(),
        manager_id,
        active_round: option::none(),
        policy,
        paused: false,
    };
    let strategy_id = strategy.id.to_inner();
    let cap = StrategyCap { id: object::new(ctx), strategy_id };

    event::emit(RangeLadderStrategyCreated {
        strategy_id,
        base_vault_id,
        manager_id,
        cap_id: cap.id.to_inner(),
    });

    (strategy, cap)
}

public fun share_strategy<Quote>(strategy: RangeLadderStrategy<Quote>) {
    transfer::share_object(strategy);
}

public fun deposit<Quote>(
    strategy: &mut RangeLadderStrategy<Quote>,
    base: &mut BaseVault<Quote>,
    funds: Coin<Quote>,
    ctx: &mut TxContext,
): Coin<RANGE_LADDER_STRATEGY> {
    assert!(!strategy.paused, EPaused);
    assert_base_vault(strategy, base);
    assert!(option::is_none(&strategy.active_round), ERoundAlreadyActive);
    let amount = funds.value();
    assert!(amount > 0, EZeroDeposit);

    let nav_before = strategy.nav(base);
    let supply = strategy.share_supply();
    let base_coin = base_vault::deposit(base, funds, ctx);
    let base_value = base.value_for_shares(base_coin.value());
    let shares = shares_for_deposit(nav_before, supply, base_value);
    assert!(shares > 0, EZeroShares);

    strategy.base_shares.join(base_coin.into_balance());
    let minted = coin::mint(&mut strategy.treasury, shares, ctx);

    event::emit(RangeLadderDeposited {
        strategy_id: strategy.id.to_inner(),
        depositor: ctx.sender(),
        amount,
        shares_minted: shares,
        nav_before,
    });

    minted
}

public fun withdraw<Quote>(
    strategy: &mut RangeLadderStrategy<Quote>,
    base: &mut BaseVault<Quote>,
    shares: Coin<RANGE_LADDER_STRATEGY>,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert_base_vault(strategy, base);
    assert!(option::is_none(&strategy.active_round), ERoundAlreadyActive);
    let share_amount = shares.value();
    assert!(share_amount > 0, EZeroShares);

    let nav_before = strategy.nav(base);
    let supply = strategy.share_supply();
    let base_share_amount = amount_for_shares(strategy.base_shares.value(), supply, share_amount);
    assert!(base_share_amount > 0, EZeroShares);

    coin::burn(&mut strategy.treasury, shares);
    let base_coin = strategy.base_shares.split(base_share_amount).into_coin(ctx);
    let out = base_vault::withdraw(base, base_coin, ctx);
    let amount_out = out.value();

    event::emit(RangeLadderWithdrawn {
        strategy_id: strategy.id.to_inner(),
        owner: ctx.sender(),
        shares_burned: share_amount,
        amount_out,
        nav_before,
    });

    out
}

public fun start_round<Quote>(
    strategy: &mut RangeLadderStrategy<Quote>,
    base: &mut BaseVault<Quote>,
    cap: &StrategyCap,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    rungs: vector<RangeRung>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!strategy.paused, EPaused);
    assert_base_vault(strategy, base);
    assert_strategy_cap(strategy, cap);
    assert!(option::is_none(&strategy.active_round), ERoundAlreadyActive);
    assert!(object::id(manager) == strategy.manager_id, EWrongManager);
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    assert!(manager.balance<Quote>() == 0, EManagerNotDedicated);
    assert!(oracle.status(clock) == oracle::status_active(), EOracleNotActive);
    policy::assert_valid_rungs(&strategy.policy, &rungs);

    redeem_all_base_shares(strategy, base, ctx);

    let nav_now = strategy.active_nav();
    assert!(nav_now > 0, EZeroDeposit);
    let premium_budget_amount = bps_amount(nav_now, policy::premium_budget_bps(&strategy.policy));
    let reserve_amount = bps_amount(nav_now, policy::reserve_bps(&strategy.policy));
    assert!(premium_budget_amount > 0, EInvalidPremiumBudget);
    assert!(strategy.cash.value() >= premium_budget_amount + reserve_amount, ECashLow);

    let manager_balance_before = manager.balance<Quote>();
    let premium_coin = strategy.cash.split(premium_budget_amount).into_coin(ctx);
    manager.deposit<Quote>(premium_coin, ctx);

    let positions = mint_ranges<Quote>(predict, manager, oracle, rungs, clock, ctx, &strategy.policy);
    let manager_balance_after_mint = manager.balance<Quote>();
    assert!(manager_balance_after_mint >= manager_balance_before, EExceededPremiumBudget);
    let total_premium_spent = premium_budget_amount - (manager_balance_after_mint - manager_balance_before);
    assert!(total_premium_spent <= premium_budget_amount, EExceededPremiumBudget);

    let refund_amount = manager_balance_after_mint - manager_balance_before;
    if (refund_amount > 0) {
        strategy.cash.join(manager.withdraw<Quote>(refund_amount, ctx).into_balance());
    };

    let range_count = positions.length();
    strategy.active_round = option::some(RangeRound {
        predict_id: object::id(predict),
        oracle_id: oracle.id(),
        positions,
    });

    event::emit(RangeRoundStarted {
        strategy_id: strategy.id.to_inner(),
        predict_id: object::id(predict),
        manager_id: strategy.manager_id,
        oracle_id: oracle.id(),
        premium_budget_amount,
        total_premium_spent,
        refund_amount,
        reserve_amount,
        range_count,
    });
}

public fun settle_round<Quote>(
    strategy: &mut RangeLadderStrategy<Quote>,
    base: &mut BaseVault<Quote>,
    cap: &StrategyCap,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_base_vault(strategy, base);
    assert_strategy_cap(strategy, cap);
    assert!(option::is_some(&strategy.active_round), ENoActiveRound);
    assert!(object::id(manager) == strategy.manager_id, EWrongManager);
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    assert!(oracle.is_settled(), EOracleNotSettled);

    let round = option::extract(&mut strategy.active_round);
    assert!(object::id(predict) == round.predict_id, EWrongPredict);
    assert!(oracle.id() == round.oracle_id, EWrongOracle);

    let manager_balance_before = manager.balance<Quote>();
    round.positions.do!(|position| {
        let key = position.position_key();
        let quantity = position.position_quantity();
        assert_range_position(manager, key, quantity);
        predict.redeem_range<Quote>(manager, oracle, key, quantity, clock, ctx);
    });

    let manager_balance_after = manager.balance<Quote>();
    assert!(manager_balance_after >= manager_balance_before, EInvalidRangePayout);
    let payout_swept = manager_balance_after - manager_balance_before;
    if (payout_swept > 0) {
        strategy.cash.join(manager.withdraw<Quote>(payout_swept, ctx).into_balance());
    };

    deposit_all_cash_to_base(strategy, base, ctx);

    event::emit(RangeRoundSettled {
        strategy_id: strategy.id.to_inner(),
        predict_id: round.predict_id,
        manager_id: strategy.manager_id,
        oracle_id: round.oracle_id,
        payout_swept,
        nav_after_settle: strategy.nav(base),
    });
}

public fun set_paused<Quote>(strategy: &mut RangeLadderStrategy<Quote>, cap: &StrategyCap, paused: bool) {
    assert_strategy_cap(strategy, cap);
    strategy.paused = paused;
}

public fun set_policy<Quote>(strategy: &mut RangeLadderStrategy<Quote>, cap: &StrategyCap, policy: RangeLadderPolicy) {
    assert_strategy_cap(strategy, cap);
    strategy.policy = policy;
}

public fun shares_for_deposit(nav_before: u64, supply: u64, amount: u64): u64 {
    if (supply == 0 || nav_before == 0) {
        amount
    } else {
        ((amount as u128) * (supply as u128) / (nav_before as u128)) as u64
    }
}

public fun amount_for_shares(nav_now: u64, supply: u64, shares: u64): u64 {
    assert!(supply > 0, EZeroShares);
    ((shares as u128) * (nav_now as u128) / (supply as u128)) as u64
}

public fun id<Quote>(strategy: &RangeLadderStrategy<Quote>): ID { strategy.id.to_inner() }

public fun manager_id<Quote>(strategy: &RangeLadderStrategy<Quote>): ID { strategy.manager_id }

public fun paused<Quote>(strategy: &RangeLadderStrategy<Quote>): bool { strategy.paused }

public fun has_active_round<Quote>(strategy: &RangeLadderStrategy<Quote>): bool { option::is_some(&strategy.active_round) }

public fun active_round<Quote>(strategy: &RangeLadderStrategy<Quote>): Option<RangeRound> { strategy.active_round }

public fun policy<Quote>(strategy: &RangeLadderStrategy<Quote>): RangeLadderPolicy { strategy.policy }

public fun nav<Quote>(strategy: &RangeLadderStrategy<Quote>, base: &BaseVault<Quote>): u64 {
    let base_share_amount = strategy.base_shares.value();
    let base_value = if (base_share_amount == 0) { 0 } else { base.value_for_shares(base_share_amount) };
    strategy.active_nav() + base_value
}

public fun active_nav<Quote>(strategy: &RangeLadderStrategy<Quote>): u64 { strategy.cash.value() }

public fun share_supply<Quote>(strategy: &RangeLadderStrategy<Quote>): u64 { strategy.treasury.total_supply() }

public fun cash_value<Quote>(strategy: &RangeLadderStrategy<Quote>): u64 { strategy.cash.value() }

public fun base_vault_id<Quote>(strategy: &RangeLadderStrategy<Quote>): ID { strategy.base_vault_id }

public fun base_shares_amount<Quote>(strategy: &RangeLadderStrategy<Quote>): u64 { strategy.base_shares.value() }

public fun cap_id(cap: &StrategyCap): ID { cap.id.to_inner() }

public fun cap_strategy_id(cap: &StrategyCap): ID { cap.strategy_id }

public fun round_predict_id(round: &RangeRound): ID { round.predict_id }

public fun round_oracle_id(round: &RangeRound): ID { round.oracle_id }

public fun round_positions(round: &RangeRound): vector<RangePosition> { round.positions }

public fun round_position_count(round: &RangeRound): u64 { round.positions.length() }

public(package) fun assert_strategy_cap<Quote>(strategy: &RangeLadderStrategy<Quote>, cap: &StrategyCap) {
    assert!(cap.strategy_id == strategy.id.to_inner(), EWrongStrategyCap);
}

fun assert_base_vault<Quote>(strategy: &RangeLadderStrategy<Quote>, base: &BaseVault<Quote>) {
    assert!(base.id() == strategy.base_vault_id, EWrongBaseVault);
}

fun redeem_all_base_shares<Quote>(
    strategy: &mut RangeLadderStrategy<Quote>,
    base: &mut BaseVault<Quote>,
    ctx: &mut TxContext,
) {
    if (strategy.base_shares.value() > 0) {
        let base_coin = strategy.base_shares.withdraw_all().into_coin(ctx);
        let quote_coin = base_vault::withdraw(base, base_coin, ctx);
        strategy.cash.join(quote_coin.into_balance());
    };
}

fun deposit_all_cash_to_base<Quote>(
    strategy: &mut RangeLadderStrategy<Quote>,
    base: &mut BaseVault<Quote>,
    ctx: &mut TxContext,
) {
    if (strategy.cash.value() > 0) {
        let cash_coin = strategy.cash.withdraw_all().into_coin(ctx);
        let base_coin = base_vault::deposit(base, cash_coin, ctx);
        strategy.base_shares.join(base_coin.into_balance());
    };
}

fun mint_ranges<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    rungs: vector<RangeRung>,
    clock: &Clock,
    ctx: &mut TxContext,
    strategy_policy: &RangeLadderPolicy,
): vector<RangePosition> {
    let mut minted = vector[];
    rungs.do!(|rung| {
        let key = range_key::new(oracle.id(), oracle.expiry(), rung.lower_strike(), rung.higher_strike());
        assert_range_position(manager, key, 0);
        let (ask_cost, _) = predict.get_range_trade_amounts(oracle, key, rung.quantity(), clock);
        assert_range_ask_within_ceiling(strategy_policy, ask_cost, rung.quantity());

        let balance_before = manager.balance<Quote>();
        predict.mint_range<Quote>(manager, oracle, key, rung.quantity(), clock, ctx);
        let balance_after = manager.balance<Quote>();
        assert!(balance_after <= balance_before, EExceededPremiumBudget);
        let cost = balance_before - balance_after;
        assert_range_ask_within_ceiling(strategy_policy, cost, rung.quantity());
        minted.push_back(policy::new_position(key, rung.quantity(), cost));
    });
    minted
}

fun assert_range_position(manager: &PredictManager, key: RangeKey, expected_quantity: u64) {
    assert!(manager.range_position(key) == expected_quantity, ERangePositionChanged);
}

fun assert_range_ask_within_ceiling(strategy_policy: &RangeLadderPolicy, ask_cost: u64, quantity: u64) {
    assert!((ask_cost as u128) * (BPS_DENOMINATOR as u128) <= (quantity as u128) * (policy::max_range_ask_bps(strategy_policy) as u128), ERangeAskAboveCeiling);
}

fun bps_amount(amount: u64, bps: u16): u64 {
    ((amount as u128) * (bps as u128) / (BPS_DENOMINATOR as u128)) as u64
}

#[test_only]
public fun set_active_round_predict_id_for_testing<Quote>(strategy: &mut RangeLadderStrategy<Quote>, predict_id: ID) {
    let round = option::borrow_mut(&mut strategy.active_round);
    round.predict_id = predict_id;
}

#[test_only]
public fun destroy_cap_for_testing(cap: StrategyCap) {
    let StrategyCap { id, strategy_id: _ } = cap;
    id.delete();
}
