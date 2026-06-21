/// Managed two-leg binary strangle strategy backed by the CallIt Base Vault.
module strangle_strategy::strategy;

use std::option::{Self, Option};
use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin, TreasuryCap},
    event,
    object::{Self, ID, UID},
};

use base_vault::base_vault::{Self, BASE_VAULT, BaseVault};
use deepbook_predict::{
    market_key::{Self, MarketKey},
    oracle::{Self, OracleSVI},
    predict::{Predict},
    predict_manager::PredictManager,
};
use strangle_strategy::policy::{Self, Policy};
use strangle_strategy::strangle::STRANGLE;

const BPS_DENOMINATOR: u64 = 10_000;

const EPaused: u64 = 1;
const EWrongStrategyAdminCap: u64 = 2;
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
const ELegAskAboveCeiling: u64 = 16;
const EExceededPremiumBudget: u64 = 17;
const EPositionChanged: u64 = 18;
const ESettledPayoutMissing: u64 = 19;
const EInvalidStrangleStrike: u64 = 20;
const EZeroQuantity: u64 = 21;
const ERoundAlreadySettled: u64 = 22;
const ERoundNotSettled: u64 = 23;
const EWrongBaseVault: u64 = 24;
const EWrongStrategyKeeperCap: u64 = 25;
const ERoundPositionMissing: u64 = 26;

public struct Round has copy, drop, store {
    predict_id: ID,
    oracle_id: ID,
    down_strike: u64,
    up_strike: u64,
    down_quantity: u64,
    up_quantity: u64,
    settled: bool,
}

public struct Strategy<phantom Quote> has key {
    id: UID,
    treasury: TreasuryCap<STRANGLE>,
    base_vault_id: ID,
    base_shares: Balance<BASE_VAULT>,
    cash: Balance<Quote>,
    manager_id: ID,
    active_round: Option<Round>,
    policy: Policy,
    paused: bool,
}

public struct StrategyAdminCap has key, store {
    id: UID,
    strategy_id: ID,
}

public struct StrategyKeeperCap has key, store {
    id: UID,
    strategy_id: ID,
}

public struct StrategyCreated has copy, drop {
    strategy_id: ID,
    base_vault_id: ID,
    manager_id: ID,
    admin_cap_id: ID,
    keeper_cap_id: ID,
}

public struct StrategyDeposited has copy, drop {
    strategy_id: ID,
    depositor: address,
    amount: u64,
    shares_minted: u64,
    nav_before: u64,
}

public struct StrategyWithdrawn has copy, drop {
    strategy_id: ID,
    owner: address,
    shares_burned: u64,
    amount_out: u64,
    nav_before: u64,
}

public struct RoundStarted has copy, drop {
    strategy_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    premium_budget_amount: u64,
    premium_spent: u64,
    refund_amount: u64,
    reserve_amount: u64,
    down_ask_cost: u64,
    up_ask_cost: u64,
}

public struct RoundSettled has copy, drop {
    strategy_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    manager_balance_swept: u64,
    nav_after_settle: u64,
}

public struct RoundRealized has copy, drop {
    strategy_id: ID,
    oracle_id: ID,
    nav_after_realize: u64,
}

public fun create_strategy<Quote>(
    treasury: TreasuryCap<STRANGLE>,
    base: &BaseVault<Quote>,
    manager: &PredictManager,
    policy: Policy,
    ctx: &mut TxContext,
): (Strategy<Quote>, StrategyAdminCap, StrategyKeeperCap) {
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    let base_vault_id = base.id();
    let manager_id = object::id(manager);
    let strategy = Strategy<Quote> {
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
    let admin_cap = StrategyAdminCap { id: object::new(ctx), strategy_id };
    let keeper_cap = StrategyKeeperCap { id: object::new(ctx), strategy_id };

    event::emit(StrategyCreated {
        strategy_id,
        base_vault_id,
        manager_id,
        admin_cap_id: admin_cap.id.to_inner(),
        keeper_cap_id: keeper_cap.id.to_inner(),
    });

    (strategy, admin_cap, keeper_cap)
}

public fun share_strategy<Quote>(strategy: Strategy<Quote>) {
    transfer::share_object(strategy);
}

public fun deposit<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    funds: Coin<Quote>,
    ctx: &mut TxContext,
): Coin<STRANGLE> {
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

    event::emit(StrategyDeposited {
        strategy_id: strategy.id.to_inner(),
        depositor: ctx.sender(),
        amount,
        shares_minted: shares,
        nav_before,
    });

    minted
}

public fun withdraw<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    shares: Coin<STRANGLE>,
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

    event::emit(StrategyWithdrawn {
        strategy_id: strategy.id.to_inner(),
        owner: ctx.sender(),
        shares_burned: share_amount,
        amount_out,
        nav_before,
    });

    out
}

public fun start_round<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    cap: &StrategyKeeperCap,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    down_strike: u64,
    down_quantity: u64,
    up_strike: u64,
    up_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!strategy.paused, EPaused);
    assert_base_vault(strategy, base);
    assert_strategy_keeper_cap(strategy, cap);
    assert!(option::is_none(&strategy.active_round), ERoundAlreadyActive);
    assert!(object::id(manager) == strategy.manager_id, EWrongManager);
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    assert!(manager.balance<Quote>() == 0, EManagerNotDedicated);
    assert!(oracle.status(clock) == oracle::status_active(), EOracleNotActive);
    assert!(down_quantity > 0 && up_quantity > 0, EZeroQuantity);
    assert_valid_strangle_strikes(&strategy.policy, oracle, down_strike, up_strike);

    redeem_all_base_shares(strategy, base, ctx);

    let nav_now = strategy.active_nav();
    assert!(nav_now > 0, EZeroDeposit);
    let premium_budget_amount = bps_amount(nav_now, policy::premium_budget_bps(&strategy.policy));
    let reserve_amount = bps_amount(nav_now, policy::reserve_bps(&strategy.policy));
    assert!(premium_budget_amount > 0, EInvalidPremiumBudget);
    assert!(strategy.cash.value() >= premium_budget_amount + reserve_amount, ECashLow);

    let down_key = market_key::new(oracle.id(), oracle.expiry(), down_strike, false);
    let up_key = market_key::new(oracle.id(), oracle.expiry(), up_strike, true);
    assert_position(manager, down_key, 0);
    assert_position(manager, up_key, 0);
    let (down_ask_cost, _) = predict.get_trade_amounts(oracle, down_key, down_quantity, clock);
    let (up_ask_cost, _) = predict.get_trade_amounts(oracle, up_key, up_quantity, clock);
    assert_leg_ask_within_ceiling(&strategy.policy, down_ask_cost, down_quantity);
    assert_leg_ask_within_ceiling(&strategy.policy, up_ask_cost, up_quantity);

    let manager_balance_before = manager.balance<Quote>();
    let premium_coin = strategy.cash.split(premium_budget_amount).into_coin(ctx);
    manager.deposit<Quote>(premium_coin, ctx);
    let manager_balance_after_deposit = manager.balance<Quote>();

    let down_balance_before = manager.balance<Quote>();
    predict.mint<Quote>(manager, oracle, down_key, down_quantity, clock, ctx);
    let down_balance_after = manager.balance<Quote>();
    assert!(down_balance_after <= down_balance_before, EExceededPremiumBudget);
    assert_leg_ask_within_ceiling(&strategy.policy, down_balance_before - down_balance_after, down_quantity);

    let up_balance_before = manager.balance<Quote>();
    predict.mint<Quote>(manager, oracle, up_key, up_quantity, clock, ctx);
    let manager_balance_after_mint = manager.balance<Quote>();
    assert!(manager_balance_after_mint <= up_balance_before, EExceededPremiumBudget);
    assert_leg_ask_within_ceiling(&strategy.policy, up_balance_before - manager_balance_after_mint, up_quantity);
    assert!(manager_balance_after_mint >= manager_balance_before, EExceededPremiumBudget);
    let premium_spent = manager_balance_after_deposit - manager_balance_after_mint;
    assert!(premium_spent <= premium_budget_amount, EExceededPremiumBudget);

    let refund_amount = manager_balance_after_mint - manager_balance_before;
    if (refund_amount > 0) {
        strategy.cash.join(manager.withdraw<Quote>(refund_amount, ctx).into_balance());
    };

    strategy.active_round = option::some(Round {
        predict_id: object::id(predict),
        oracle_id: oracle.id(),
        down_strike,
        up_strike,
        down_quantity,
        up_quantity,
        settled: false,
    });

    event::emit(RoundStarted {
        strategy_id: strategy.id.to_inner(),
        predict_id: object::id(predict),
        manager_id: strategy.manager_id,
        oracle_id: oracle.id(),
        premium_budget_amount,
        premium_spent,
        refund_amount,
        reserve_amount,
        down_ask_cost,
        up_ask_cost,
    });
}

public fun settle_round<Quote>(
    strategy: &mut Strategy<Quote>,
    cap: &StrategyKeeperCap,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_strategy_keeper_cap(strategy, cap);
    assert!(option::is_some(&strategy.active_round), ENoActiveRound);
    assert!(object::id(manager) == strategy.manager_id, EWrongManager);
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    assert!(oracle.is_settled(), EOracleNotSettled);

    let round = *option::borrow(&strategy.active_round);
    assert!(!round.settled, ERoundAlreadySettled);
    assert!(object::id(predict) == round.predict_id, EWrongPredict);
    assert!(oracle.id() == round.oracle_id, EWrongOracle);

    let down_key = market_key::new(round.oracle_id, oracle.expiry(), round.down_strike, false);
    let up_key = market_key::new(round.oracle_id, oracle.expiry(), round.up_strike, true);
    let down_payout = settled_down_payout(&round, oracle);
    let up_payout = settled_up_payout(&round, oracle);
    redeem_or_assert_swept<Quote>(predict, manager, oracle, down_key, round.down_quantity, down_payout, clock, ctx);
    redeem_or_assert_swept<Quote>(predict, manager, oracle, up_key, round.up_quantity, up_payout, clock, ctx);

    let manager_balance_swept = manager.balance<Quote>();
    if (manager_balance_swept > 0) {
        let proceeds = manager.withdraw<Quote>(manager_balance_swept, ctx);
        strategy.cash.join(proceeds.into_balance());
    };

    let round_mut = option::borrow_mut(&mut strategy.active_round);
    round_mut.settled = true;

    event::emit(RoundSettled {
        strategy_id: strategy.id.to_inner(),
        predict_id: round.predict_id,
        manager_id: strategy.manager_id,
        oracle_id: round.oracle_id,
        manager_balance_swept,
        nav_after_settle: strategy.active_nav(),
    });
}

public fun realize_round<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    cap: &StrategyKeeperCap,
    predict: &mut Predict,
    ctx: &mut TxContext,
) {
    assert_base_vault(strategy, base);
    assert_strategy_keeper_cap(strategy, cap);
    assert!(option::is_some(&strategy.active_round), ENoActiveRound);
    let round = option::extract(&mut strategy.active_round);
    assert!(round.settled, ERoundNotSettled);
    assert!(object::id(predict) == round.predict_id, EWrongPredict);

    deposit_all_cash_to_base(strategy, base, ctx);

    event::emit(RoundRealized {
        strategy_id: strategy.id.to_inner(),
        oracle_id: round.oracle_id,
        nav_after_realize: strategy.nav(base),
    });
}

public fun set_paused<Quote>(strategy: &mut Strategy<Quote>, cap: &StrategyAdminCap, paused: bool) {
    assert_strategy_admin_cap(strategy, cap);
    strategy.paused = paused;
}

public fun set_policy<Quote>(strategy: &mut Strategy<Quote>, cap: &StrategyAdminCap, policy: Policy) {
    assert_strategy_admin_cap(strategy, cap);
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

public fun id<Quote>(strategy: &Strategy<Quote>): ID { strategy.id.to_inner() }

public fun manager_id<Quote>(strategy: &Strategy<Quote>): ID { strategy.manager_id }

public fun paused<Quote>(strategy: &Strategy<Quote>): bool { strategy.paused }

public fun has_active_round<Quote>(strategy: &Strategy<Quote>): bool { option::is_some(&strategy.active_round) }

public fun active_round<Quote>(strategy: &Strategy<Quote>): Option<Round> { strategy.active_round }

public fun policy<Quote>(strategy: &Strategy<Quote>): Policy { strategy.policy }

public fun nav<Quote>(strategy: &Strategy<Quote>, base: &BaseVault<Quote>): u64 {
    let base_share_amount = strategy.base_shares.value();
    let base_value = if (base_share_amount == 0) { 0 } else { base.value_for_shares(base_share_amount) };
    strategy.active_nav() + base_value
}

public fun active_nav<Quote>(strategy: &Strategy<Quote>): u64 { strategy.cash.value() }

public fun share_supply<Quote>(strategy: &Strategy<Quote>): u64 { strategy.treasury.total_supply() }

public fun cash_value<Quote>(strategy: &Strategy<Quote>): u64 { strategy.cash.value() }

public fun base_vault_id<Quote>(strategy: &Strategy<Quote>): ID { strategy.base_vault_id }

public fun base_shares_amount<Quote>(strategy: &Strategy<Quote>): u64 { strategy.base_shares.value() }

public fun admin_cap_id(cap: &StrategyAdminCap): ID { cap.id.to_inner() }

public fun admin_cap_strategy_id(cap: &StrategyAdminCap): ID { cap.strategy_id }

public fun keeper_cap_id(cap: &StrategyKeeperCap): ID { cap.id.to_inner() }

public fun keeper_cap_strategy_id(cap: &StrategyKeeperCap): ID { cap.strategy_id }

public fun round_predict_id(round: &Round): ID { round.predict_id }

public fun round_oracle_id(round: &Round): ID { round.oracle_id }

public fun round_down_strike(round: &Round): u64 { round.down_strike }

public fun round_up_strike(round: &Round): u64 { round.up_strike }

public fun round_down_quantity(round: &Round): u64 { round.down_quantity }

public fun round_up_quantity(round: &Round): u64 { round.up_quantity }

public fun round_settled(round: &Round): bool { round.settled }

public(package) fun assert_strategy_admin_cap<Quote>(strategy: &Strategy<Quote>, cap: &StrategyAdminCap) {
    assert!(cap.strategy_id == strategy.id.to_inner(), EWrongStrategyAdminCap);
}

public(package) fun assert_strategy_keeper_cap<Quote>(strategy: &Strategy<Quote>, cap: &StrategyKeeperCap) {
    assert!(cap.strategy_id == strategy.id.to_inner(), EWrongStrategyKeeperCap);
}

fun assert_base_vault<Quote>(strategy: &Strategy<Quote>, base: &BaseVault<Quote>) {
    assert!(base.id() == strategy.base_vault_id, EWrongBaseVault);
}

fun redeem_all_base_shares<Quote>(
    strategy: &mut Strategy<Quote>,
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
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    ctx: &mut TxContext,
) {
    if (strategy.cash.value() > 0) {
        let cash_coin = strategy.cash.withdraw_all().into_coin(ctx);
        let base_coin = base_vault::deposit(base, cash_coin, ctx);
        strategy.base_shares.join(base_coin.into_balance());
    };
}

fun assert_valid_strangle_strikes(strategy_policy: &Policy, oracle: &OracleSVI, down_strike: u64, up_strike: u64) {
    let spot = oracle.spot_price();
    let band = bps_amount(spot, policy::strike_band_bps(strategy_policy));
    let spot_u128 = spot as u128;
    let band_u128 = band as u128;
    assert!((down_strike as u128) < spot_u128 && (up_strike as u128) > spot_u128 && down_strike < up_strike, EInvalidStrangleStrike);
    assert!((down_strike as u128) + band_u128 >= spot_u128 && (up_strike as u128) <= spot_u128 + band_u128, EInvalidStrangleStrike);
}

fun assert_leg_ask_within_ceiling(strategy_policy: &Policy, ask_cost: u64, quantity: u64) {
    assert!((ask_cost as u128) * (BPS_DENOMINATOR as u128) <= (quantity as u128) * (policy::max_leg_ask_bps(strategy_policy) as u128), ELegAskAboveCeiling);
}

fun assert_position(manager: &PredictManager, key: MarketKey, expected_quantity: u64) {
    assert!(manager.position(key) == expected_quantity, EPositionChanged);
}

fun redeem_or_assert_swept<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    expected_payout: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let remaining = manager.position(key);
    if (remaining > 0) {
        assert!(remaining >= quantity, ERoundPositionMissing);
        let manager_balance_before_redeem = manager.balance<Quote>();
        predict.redeem_permissionless<Quote>(manager, oracle, key, quantity, clock, ctx);
        let manager_balance_after_redeem = manager.balance<Quote>();
        assert!((manager_balance_after_redeem as u128) >= (manager_balance_before_redeem as u128) + (expected_payout as u128), ESettledPayoutMissing);
    } else {
        assert!(manager.balance<Quote>() >= expected_payout, ESettledPayoutMissing);
    };
}

fun settled_down_payout(round: &Round, oracle: &OracleSVI): u64 {
    let settlement = option::destroy_some(oracle.settlement_price());
    if (settlement <= round.down_strike) {
        round.down_quantity
    } else {
        0
    }
}

fun settled_up_payout(round: &Round, oracle: &OracleSVI): u64 {
    let settlement = option::destroy_some(oracle.settlement_price());
    if (settlement > round.up_strike) {
        round.up_quantity
    } else {
        0
    }
}

fun bps_amount(amount: u64, bps: u16): u64 {
    ((amount as u128) * (bps as u128) / (BPS_DENOMINATOR as u128)) as u64
}

#[test_only]
public fun set_active_round_predict_id_for_testing<Quote>(strategy: &mut Strategy<Quote>, predict_id: ID) {
    let round = option::borrow_mut(&mut strategy.active_round);
    round.predict_id = predict_id;
}

#[test_only]
public fun destroy_admin_cap_for_testing(cap: StrategyAdminCap) {
    let StrategyAdminCap { id, strategy_id: _ } = cap;
    id.delete();
}

#[test_only]
public fun destroy_keeper_cap_for_testing(cap: StrategyKeeperCap) {
    let StrategyKeeperCap { id, strategy_id: _ } = cap;
    id.delete();
}
