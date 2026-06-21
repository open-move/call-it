#[test_only]
module bullish_upside_strategy::bullish_upside_tests;

use bullish_upside_strategy::{
    bup::BUP,
    policy,
    strategy::{Self as strategy, Strategy, StrategyAdminCap},
    test_quote::{Self, TEST_QUOTE},
};
use base_vault::base_vault::{Self as base_vault, BASE_VAULT, BaseVault};
use deepbook_predict::{
    i64,
    market_key,
    oracle::{Self, OracleSVI, OracleSVICap},
    plp::PLP,
    predict::{Self, Predict},
    predict_manager::PredictManager,
    registry::{Self, AdminCap, Registry},
};
use std::{option, unit_test::{assert_eq, destroy}};
use sui::{clock::{Self, Clock}, coin::{Self, Coin}, coin_registry::Currency, object::ID, test_scenario::{begin, end, return_shared, Scenario}};

const ADMIN: address = @0xA;
const USER: address = @0xB;
const OTHER: address = @0xC;

const EXPIRY_MS: u64 = 1_000_000;
const SPOT: u64 = 100_000_000_000;
const STRIKE: u64 = 110_000_000_000;
const TICK_SIZE: u64 = 10_000;
const DEPOSIT_AMOUNT: u64 = 10_000_000_000;
const SECOND_DEPOSIT_AMOUNT: u64 = 20_000_000_000;
const PREMIUM_BUDGET_BPS: u16 = 1_000;
const STRIKE_BAND_BPS: u16 = 2_000;
const RESERVE_BPS: u16 = 1_000;
const MAX_UP_ASK_BPS: u64 = 10_000;
const QUANTITY: u64 = 10_000;
const SEED_LIQUIDITY: u64 = 1_000_000_000_000_000;
const MANAGER_BASELINE: u64 = 123_456_789;
const DEFAULT_GRACE: u64 = 4;

public struct Env has drop {
    base_vault_id: ID,
    strategy_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
}

#[test]
fun create_strategy_sets_policy_caps_and_manager() {
    let mut test = begin(ADMIN);
    let manager_id = setup_manager(&mut test, ADMIN);

    test.next_tx(ADMIN);
    {
        let manager = test.take_shared_by_id<PredictManager>(manager_id);
        let base_treasury = coin::create_treasury_cap_for_testing<BASE_VAULT>(test.ctx());
        let (base, base_cap) = base_vault::create_vault<TEST_QUOTE>(base_treasury, test.ctx());
        let base_vault_id = base.id();
        let treasury = coin::create_treasury_cap_for_testing<BUP>(test.ctx());

        let (strategy, admin_cap, keeper_cap) = strategy::create_strategy<TEST_QUOTE>(
            treasury,
            &base,
            &manager,
            default_policy(),
            test.ctx(),
        );
        let strategy_id = strategy.id();

        assert_eq!(strategy.manager_id(), manager_id);
        assert_eq!(strategy.base_vault_id(), base_vault_id);
        assert_eq!(strategy.base_shares_amount(), 0);
        assert_eq!(strategy.reserved_base_shares_amount(), 0);
        assert_eq!(strategy.pending_shares_amount(), 0);
        assert_eq!(strategy.nav(&base), 0);
        assert_eq!(strategy.share_supply(), 0);
        assert_eq!(strategy.current_round(), 0);
        assert_eq!(strategy.stale_withdrawal_grace_rounds(), DEFAULT_GRACE);
        assert!(!strategy.has_active_round());
        assert!(!strategy.paused());
        assert_eq!(policy::premium_budget_bps(&strategy.policy()), PREMIUM_BUDGET_BPS);
        assert_eq!(strategy::admin_cap_strategy_id(&admin_cap), strategy_id);
        assert_eq!(strategy::keeper_cap_strategy_id(&keeper_cap), strategy_id);

        strategy::share_strategy(strategy);
        base_vault::share_vault(base);
        strategy::destroy_admin_cap_for_testing(admin_cap);
        strategy::destroy_keeper_cap_for_testing(keeper_cap);
        base_vault::destroy_cap_for_testing(base_cap);
        return_shared(manager);
    };
    end(test);
}

#[test]
fun deposit_and_withdraw_round_trip_through_base() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    test.next_tx(USER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let shares = test.take_from_sender<Coin<BUP>>();

        assert_eq!(shares.value(), DEPOSIT_AMOUNT);
        assert_eq!(strategy.base_shares_amount(), DEPOSIT_AMOUNT);
        assert_eq!(base.cash_value(), DEPOSIT_AMOUNT);
        assert_eq!(strategy.nav(&base), DEPOSIT_AMOUNT);
        assert_eq!(strategy.share_supply(), DEPOSIT_AMOUNT);

        let out = strategy::withdraw(&mut strategy, &mut base, shares, test.ctx());
        assert_eq!(out.value(), DEPOSIT_AMOUNT);
        assert_eq!(strategy.base_shares_amount(), 0);
        assert_eq!(strategy.share_supply(), 0);
        assert_eq!(base.cash_value(), 0);

        transfer::public_transfer(out, USER);
        return_shared(strategy);
        return_shared(base);
    };

    end(test);
}

#[test]
fun multiple_deposits_mint_proportional_shares() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);

    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    deposit_as(&mut test, &env, OTHER, SECOND_DEPOSIT_AMOUNT);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        assert_eq!(strategy.base_shares_amount(), 30_000_000_000);
        assert_eq!(base.cash_value(), 30_000_000_000);
        assert_eq!(strategy.nav(&base), 30_000_000_000);
        assert_eq!(strategy.share_supply(), 30_000_000_000);
        return_shared(strategy);
        return_shared(base);
    };

    end(test);
}

#[test]
fun start_round_opens_up_position() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, STRIKE, QUANTITY);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, true);
        let round = option::destroy_some(strategy.active_round());

        assert!(strategy.has_active_round());
        // All idle quote is parked back in base shares between trades.
        assert!(strategy.nav(&base) >= 9_000_000_000);
        assert_eq!(manager.position(key), QUANTITY);
        assert_eq!(strategy::round_predict_id(&round), env.predict_id);
        assert_eq!(strategy::round_oracle_id(&round), env.oracle_id);
        assert_eq!(strategy::round_strike(&round), STRIKE);
        assert_eq!(strategy::round_quantity(&round), QUANTITY);

        return_shared(strategy);
        return_shared(base);
        return_shared(manager);
    };

    end(test);
}

#[test, expected_failure]
fun deposit_aborts_while_round_active() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);

    deposit_as(&mut test, &env, OTHER, SECOND_DEPOSIT_AMOUNT);

    end(test);
}

#[test, expected_failure]
fun withdraw_aborts_while_round_active() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);

    test.next_tx(USER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let shares = test.take_from_sender<Coin<BUP>>();
        let out = strategy::withdraw(&mut strategy, &mut base, shares, test.ctx());
        transfer::public_transfer(out, USER);
        return_shared(strategy);
        return_shared(base);
    };

    end(test);
}

#[test, expected_failure]
fun start_round_rejects_non_upside_strike() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, SPOT, QUANTITY);

    end(test);
}

#[test, expected_failure]
fun start_round_aborts_on_wrong_manager() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    let other_manager_id = setup_manager(&mut test, OTHER);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    test.next_tx(ADMIN);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let cap = test.take_from_sender<strategy::StrategyKeeperCap>();
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(other_manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        strategy::start_round(
            &mut strategy,
            &mut base,
            &cap,
            &mut predict,
            &mut manager,
            &oracle,
            STRIKE,
            QUANTITY,
            &clock,
            test.ctx(),
        );

        return_shared(strategy);
        return_shared(base);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test, expected_failure]
fun start_round_aborts_on_wrong_keeper_cap() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);

    test.next_tx(ADMIN);
    {
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let treasury = coin::create_treasury_cap_for_testing<BUP>(test.ctx());
        let (other_strategy, other_admin_cap, other_keeper_cap) = strategy::create_strategy<TEST_QUOTE>(
            treasury,
            &base,
            &manager,
            default_policy(),
            test.ctx(),
        );
        strategy::share_strategy(other_strategy);
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base_mut = base;
        let mut manager_mut = manager;
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        strategy::start_round(
            &mut strategy,
            &mut base_mut,
            &other_keeper_cap,
            &mut predict,
            &mut manager_mut,
            &oracle,
            STRIKE,
            QUANTITY,
            &clock,
            test.ctx(),
        );

        return_shared(strategy);
        return_shared(base_mut);
        return_shared(predict);
        return_shared(manager_mut);
        return_shared(oracle);
        return_shared(clock);
        strategy::destroy_admin_cap_for_testing(other_admin_cap);
        strategy::destroy_keeper_cap_for_testing(other_keeper_cap);
    };

    end(test);
}

#[test, expected_failure]
fun deposit_aborts_on_wrong_base_vault() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);

    test.next_tx(USER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base_treasury = coin::create_treasury_cap_for_testing<BASE_VAULT>(test.ctx());
        let (mut other_base, other_base_cap) = base_vault::create_vault<TEST_QUOTE>(base_treasury, test.ctx());
        let funds = coin::mint_for_testing<TEST_QUOTE>(DEPOSIT_AMOUNT, test.ctx());

        let shares = strategy::deposit(&mut strategy, &mut other_base, funds, test.ctx());

        transfer::public_transfer(shares, USER);
        return_shared(strategy);
        base_vault::share_vault(other_base);
        base_vault::destroy_cap_for_testing(other_base_cap);
    };

    end(test);
}

#[test, expected_failure]
fun start_round_aborts_if_manager_not_empty() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    seed_manager_balance(&mut test, env.manager_id, MANAGER_BASELINE);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, STRIKE, QUANTITY);

    end(test);
}

#[test]
fun settle_winning_up_returns_payout_to_base_shares() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE + 1);

    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, true);

        assert!(!strategy.has_active_round());
        assert_eq!(strategy.current_round(), 1);
        assert_eq!(manager.position(key), 0);
        assert_eq!(manager.balance<TEST_QUOTE>(), 0);
        assert!(strategy.nav(&base) >= 9_000_000_000 + QUANTITY);

        return_shared(strategy);
        return_shared(base);
        return_shared(manager);
    };

    end(test);
}

#[test]
fun settle_losing_up_clears_round_and_redeploys() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE);

    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, true);

        assert!(!strategy.has_active_round());
        assert_eq!(manager.position(key), 0);
        assert_eq!(manager.balance<TEST_QUOTE>(), 0);
        assert!(strategy.base_shares_amount() > 0);
        assert_eq!(strategy.nav(&base), base.value_for_shares(strategy.base_shares_amount()));

        return_shared(strategy);
        return_shared(base);
        return_shared(manager);
    };

    end(test);
}

#[test]
fun settle_after_permissionless_redeems() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE + 1);

    redeem_permissionless(&mut test, &env, OTHER, QUANTITY);
    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, true);

        assert!(!strategy.has_active_round());
        assert_eq!(manager.position(key), 0);
        assert_eq!(manager.balance<TEST_QUOTE>(), 0);

        return_shared(strategy);
        return_shared(manager);
    };

    end(test);
}

#[test]
fun settle_tolerates_partial_permissionless_redeem() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE + 1);

    redeem_permissionless(&mut test, &env, OTHER, QUANTITY / 2);
    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, true);

        assert!(!strategy.has_active_round());
        assert_eq!(manager.position(key), 0);
        assert_eq!(manager.balance<TEST_QUOTE>(), 0);
        assert!(strategy.nav(&base) >= 9_000_000_000 + QUANTITY);

        return_shared(strategy);
        return_shared(base);
        return_shared(manager);
    };

    end(test);
}

#[test]
fun settle_sweeps_post_start_manager_balance() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);
    seed_manager_balance(&mut test, env.manager_id, MANAGER_BASELINE);
    settle_oracle(&mut test, env.oracle_id, STRIKE + 1);

    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);

        assert!(!strategy.has_active_round());
        assert_eq!(manager.balance<TEST_QUOTE>(), 0);
        assert!(strategy.nav(&base) >= 9_000_000_000 + QUANTITY + MANAGER_BASELINE);

        return_shared(strategy);
        return_shared(base);
        return_shared(manager);
    };

    end(test);
}

#[test]
fun settle_preserves_extra_same_market_position() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);
    mint_extra_same_market_position(&mut test, &env, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE + 1);

    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, true);

        assert!(!strategy.has_active_round());
        assert_eq!(manager.position(key), QUANTITY);
        assert_eq!(manager.balance<TEST_QUOTE>(), 0);

        return_shared(strategy);
        return_shared(manager);
    };

    end(test);
}

#[test, expected_failure]
fun settle_round_requires_round_predict() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE + 1);

    tamper_round_predict_id(&mut test, &env);
    settle_round(&mut test, &env);

    end(test);
}

#[test, expected_failure]
fun settle_aborts_if_redeemed_payout_is_missing() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE + 1);

    redeem_permissionless(&mut test, &env, ADMIN, QUANTITY);
    drain_manager_balance(&mut test, env.manager_id);
    settle_round(&mut test, &env);

    end(test);
}

#[test, expected_failure]
fun settle_round_requires_active_round() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    settle_round(&mut test, &env);

    end(test);
}

// ----- withdrawal queue -----

#[test]
fun request_settle_claim_returns_fair_pro_rata() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);

    // USER queues their entire stake mid-round.
    request_withdraw_all(&mut test, &env, USER);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        assert!(strategy.has_withdrawal_request(USER));
        assert_eq!(strategy.withdrawal_request_shares(USER), DEPOSIT_AMOUNT);
        assert_eq!(strategy.pending_shares_amount(), DEPOSIT_AMOUNT);
        assert!(!strategy.withdrawal_request_settled(USER));
        return_shared(strategy);
    };

    settle_oracle(&mut test, env.oracle_id, STRIKE);
    settle_round(&mut test, &env);

    // After settlement the escrow is burned and the reserve is set aside.
    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        // USER was the only holder; all deployable shares are reserved.
        assert_eq!(strategy.pending_shares_amount(), 0);
        assert_eq!(strategy.share_supply(), 0);
        assert_eq!(strategy.base_shares_amount(), 0);
        assert!(strategy.reserved_base_shares_amount() > 0);
        assert_eq!(strategy.nav(&base), 0);
        assert!(strategy.withdrawal_request_settled(USER));
        return_shared(strategy);
        return_shared(base);
    };

    // USER claims fair value at the settled price (~the surviving reserve pool).
    claim_withdrawal(&mut test, &env, USER);

    test.next_tx(USER);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let out = test.take_from_sender<Coin<TEST_QUOTE>>();
        assert!(out.value() >= 9_000_000_000);
        assert_eq!(strategy.reserved_base_shares_amount(), 0);
        assert!(!strategy.has_withdrawal_request(USER));
        transfer::public_transfer(out, USER);
        return_shared(strategy);
    };

    end(test);
}

#[test]
fun two_requests_in_one_round_split_reserve_pro_rata() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    deposit_as(&mut test, &env, OTHER, SECOND_DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);

    request_withdraw_all(&mut test, &env, USER);
    request_withdraw_all(&mut test, &env, OTHER);

    settle_oracle(&mut test, env.oracle_id, STRIKE);
    settle_round(&mut test, &env);

    claim_withdrawal(&mut test, &env, USER);
    let user_out = take_quote(&mut test, USER);

    claim_withdrawal(&mut test, &env, OTHER);
    let other_out = take_quote(&mut test, OTHER);

    // OTHER deposited 2x USER, so should receive ~2x the proceeds.
    assert!(other_out >= user_out * 2 - 4);
    assert!(other_out <= user_out * 2 + 4);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        // Both claimed; nothing stranded.
        assert_eq!(strategy.reserved_base_shares_amount(), 0);
        assert_eq!(strategy.share_supply(), 0);
        return_shared(strategy);
    };

    end(test);
}

#[test]
fun cancel_before_settle_returns_escrowed_shares() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);

    request_withdraw_all(&mut test, &env, USER);

    test.next_tx(USER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let refund = strategy::cancel_request(&mut strategy, test.ctx());
        assert_eq!(refund.value(), DEPOSIT_AMOUNT);
        assert_eq!(strategy.pending_shares_amount(), 0);
        assert!(!strategy.has_withdrawal_request(USER));
        transfer::public_transfer(refund, USER);
        return_shared(strategy);
    };

    end(test);
}

#[test, expected_failure]
fun cancel_after_settle_aborts() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    deposit_as(&mut test, &env, OTHER, SECOND_DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);

    request_withdraw_all(&mut test, &env, USER);
    settle_oracle(&mut test, env.oracle_id, STRIKE);
    settle_round(&mut test, &env);

    test.next_tx(USER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let refund = strategy::cancel_request(&mut strategy, test.ctx());
        transfer::public_transfer(refund, USER);
        return_shared(strategy);
    };

    end(test);
}

#[test]
fun reserved_funds_are_excluded_from_deployable_capital() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    deposit_as(&mut test, &env, OTHER, SECOND_DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);

    // USER exits; OTHER stays in.
    request_withdraw_all(&mut test, &env, USER);
    settle_oracle(&mut test, env.oracle_id, STRIKE);
    settle_round(&mut test, &env);

    // After settlement, USER's slice sits in `reserved_base_shares` and is NOT
    // part of NAV / deployable `base_shares`. A subsequent `start_round` only
    // ever redeems `base_shares`, so the reserve can never be re-deployed.
    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let reserved = strategy.reserved_base_shares_amount();
        let deployable = strategy.base_shares_amount();
        assert!(reserved > 0);
        assert!(deployable > 0);
        // NAV counts only deployable shares.
        assert_eq!(strategy.nav(&base), base.value_for_shares(deployable));
        // Total backing in the base vault covers both pools.
        assert_eq!(base.share_supply(), reserved + deployable);
        return_shared(strategy);
        return_shared(base);
    };

    // The reserve remains fully claimable by USER regardless of OTHER's activity.
    claim_withdrawal(&mut test, &env, USER);
    let user_out = take_quote(&mut test, USER);
    assert!(user_out >= 9_000_000_000);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        assert_eq!(strategy.reserved_base_shares_amount(), 0);
        // OTHER's shares remain outstanding and deployable.
        assert_eq!(strategy.share_supply(), SECOND_DEPOSIT_AMOUNT);
        return_shared(strategy);
    };

    end(test);
}

#[test]
fun instant_withdraw_between_rounds_works() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE);
    settle_round(&mut test, &env);

    // Round closed: USER (who did not queue) exits instantly.
    test.next_tx(USER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let shares = test.take_from_sender<Coin<BUP>>();
        let out = strategy::withdraw(&mut strategy, &mut base, shares, test.ctx());
        assert!(out.value() >= 9_000_000_000);
        assert_eq!(strategy.base_shares_amount(), 0);
        assert_eq!(strategy.share_supply(), 0);
        transfer::public_transfer(out, USER);
        return_shared(strategy);
        return_shared(base);
    };

    end(test);
}

#[test]
fun stale_sweep_reenrolls_after_grace() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    deposit_as(&mut test, &env, OTHER, SECOND_DEPOSIT_AMOUNT);
    set_grace(&mut test, &env, 1);
    start_round(&mut test, &env, STRIKE, QUANTITY);

    request_withdraw_all(&mut test, &env, USER);
    settle_oracle(&mut test, env.oracle_id, STRIKE);
    settle_round(&mut test, &env);

    // grace == 1; request settled in round 0, current round now 1, so stale.
    test.next_tx(OTHER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        strategy::sweep_stale_withdrawal(&mut strategy, &base, USER, test.ctx());
        assert!(!strategy.has_withdrawal_request(USER));
        assert_eq!(strategy.reserved_base_shares_amount(), 0);
        return_shared(strategy);
        return_shared(base);
    };

    // USER is re-issued fresh BUP shares.
    test.next_tx(USER);
    {
        let shares = test.take_from_sender<Coin<BUP>>();
        assert!(shares.value() > 0);
        transfer::public_transfer(shares, USER);
    };

    end(test);
}

#[test, expected_failure]
fun stale_sweep_aborts_before_grace() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    deposit_as(&mut test, &env, OTHER, SECOND_DEPOSIT_AMOUNT);
    // Default grace is 4; one settled round is not enough.
    start_round(&mut test, &env, STRIKE, QUANTITY);

    request_withdraw_all(&mut test, &env, USER);
    settle_oracle(&mut test, env.oracle_id, STRIKE);
    settle_round(&mut test, &env);

    test.next_tx(OTHER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        strategy::sweep_stale_withdrawal(&mut strategy, &base, USER, test.ctx());
        return_shared(strategy);
        return_shared(base);
    };

    end(test);
}

#[test, expected_failure]
fun request_withdraw_aborts_without_active_round() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    test.next_tx(USER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let shares = test.take_from_sender<Coin<BUP>>();
        strategy::request_withdraw(&mut strategy, shares, test.ctx());
        return_shared(strategy);
    };

    end(test);
}

// ----- policy / admin -----

#[test, expected_failure]
fun invalid_policy_aborts() {
    policy::new(PREMIUM_BUDGET_BPS, STRIKE_BAND_BPS, RESERVE_BPS, 0);
    abort
}

#[test, expected_failure]
fun invalid_combined_policy_budget_aborts() {
    policy::new(9_000, STRIKE_BAND_BPS, 2_000, MAX_UP_ASK_BPS);
    abort
}

#[test, expected_failure]
fun wrong_strategy_cap_cannot_set_policy() {
    let mut test = begin(ADMIN);
    let manager_id = setup_manager(&mut test, ADMIN);

    test.next_tx(ADMIN);
    let manager = test.take_shared_by_id<PredictManager>(manager_id);
    let base_treasury = coin::create_treasury_cap_for_testing<BASE_VAULT>(test.ctx());
    let (base, base_cap) = base_vault::create_vault<TEST_QUOTE>(base_treasury, test.ctx());
    let first_treasury = coin::create_treasury_cap_for_testing<BUP>(test.ctx());
    let second_treasury = coin::create_treasury_cap_for_testing<BUP>(test.ctx());
    let (mut first_strategy, first_admin_cap, first_keeper_cap) = strategy::create_strategy<TEST_QUOTE>(
        first_treasury,
        &base,
        &manager,
        default_policy(),
        test.ctx(),
    );
    let (_second_strategy, second_admin_cap, second_keeper_cap) = strategy::create_strategy<TEST_QUOTE>(
        second_treasury,
        &base,
        &manager,
        default_policy(),
        test.ctx(),
    );

    strategy::set_policy(&mut first_strategy, &second_admin_cap, default_policy());

    strategy::destroy_admin_cap_for_testing(first_admin_cap);
    strategy::destroy_keeper_cap_for_testing(first_keeper_cap);
    strategy::destroy_admin_cap_for_testing(second_admin_cap);
    strategy::destroy_keeper_cap_for_testing(second_keeper_cap);
    base_vault::destroy_cap_for_testing(base_cap);
    abort
}

#[test, expected_failure]
fun wrong_strategy_cap_cannot_set_grace() {
    let mut test = begin(ADMIN);
    let manager_id = setup_manager(&mut test, ADMIN);

    test.next_tx(ADMIN);
    let manager = test.take_shared_by_id<PredictManager>(manager_id);
    let base_treasury = coin::create_treasury_cap_for_testing<BASE_VAULT>(test.ctx());
    let (base, base_cap) = base_vault::create_vault<TEST_QUOTE>(base_treasury, test.ctx());
    let first_treasury = coin::create_treasury_cap_for_testing<BUP>(test.ctx());
    let second_treasury = coin::create_treasury_cap_for_testing<BUP>(test.ctx());
    let (mut first_strategy, first_admin_cap, first_keeper_cap) = strategy::create_strategy<TEST_QUOTE>(
        first_treasury,
        &base,
        &manager,
        default_policy(),
        test.ctx(),
    );
    let (_second_strategy, second_admin_cap, second_keeper_cap) = strategy::create_strategy<TEST_QUOTE>(
        second_treasury,
        &base,
        &manager,
        default_policy(),
        test.ctx(),
    );

    strategy::set_stale_grace(&mut first_strategy, &second_admin_cap, 2);

    strategy::destroy_admin_cap_for_testing(first_admin_cap);
    strategy::destroy_keeper_cap_for_testing(first_keeper_cap);
    strategy::destroy_admin_cap_for_testing(second_admin_cap);
    strategy::destroy_keeper_cap_for_testing(second_keeper_cap);
    base_vault::destroy_cap_for_testing(base_cap);
    abort
}

// ----- harness -----

fun setup_strategy(test: &mut Scenario): Env {
    setup_strategy_with_policy(test, default_policy())
}

fun setup_strategy_with_policy(test: &mut Scenario, strategy_policy: policy::Policy): Env {
    setup_clock(test);
    let currency = test_quote::create_currency(test.ctx());
    registry::init_for_testing(test.ctx());

    test.next_tx(ADMIN);
    let predict_id = setup_predict(test, &currency);
    destroy(currency);
    seed_predict_liquidity(test, predict_id);
    let oracle_id = setup_oracle(test, predict_id);
    activate_oracle(test, oracle_id);
    let manager_id = setup_manager(test, ADMIN);

    test.next_tx(ADMIN);
    let base_treasury = coin::create_treasury_cap_for_testing<BASE_VAULT>(test.ctx());
    let (base, base_cap) = base_vault::create_vault<TEST_QUOTE>(base_treasury, test.ctx());
    let base_vault_id = base.id();
    base_vault::share_vault(base);
    base_vault::destroy_cap_for_testing(base_cap);

    test.next_tx(ADMIN);
    let treasury = coin::create_treasury_cap_for_testing<BUP>(test.ctx());
    let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(base_vault_id);
    let manager = test.take_shared_by_id<PredictManager>(manager_id);
    let (strategy, admin_cap, keeper_cap) = strategy::create_strategy<TEST_QUOTE>(
        treasury,
        &base,
        &manager,
        strategy_policy,
        test.ctx(),
    );
    let strategy_id = strategy.id();
    strategy::share_strategy(strategy);
    transfer::public_transfer(admin_cap, ADMIN);
    transfer::public_transfer(keeper_cap, ADMIN);
    return_shared(base);
    return_shared(manager);

    Env { base_vault_id, strategy_id, predict_id, manager_id, oracle_id }
}

fun start_round(test: &mut Scenario, env: &Env, strike: u64, quantity: u64) {
    test.next_tx(ADMIN);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let cap = test.take_from_sender<strategy::StrategyKeeperCap>();
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        strategy::start_round(
            &mut strategy,
            &mut base,
            &cap,
            &mut predict,
            &mut manager,
            &oracle,
            strike,
            quantity,
            &clock,
            test.ctx(),
        );

        return_shared(strategy);
        return_shared(base);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
        test.return_to_sender(cap);
    }
}

fun settle_round(test: &mut Scenario, env: &Env) {
    test.next_tx(ADMIN);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let cap = test.take_from_sender<strategy::StrategyKeeperCap>();
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        strategy::settle_round(&mut strategy, &mut base, &cap, &mut predict, &mut manager, &oracle, &clock, test.ctx());

        return_shared(strategy);
        return_shared(base);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
        test.return_to_sender(cap);
    }
}

fun request_withdraw_all(test: &mut Scenario, env: &Env, user: address) {
    test.next_tx(user);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let shares = test.take_from_sender<Coin<BUP>>();
        strategy::request_withdraw(&mut strategy, shares, test.ctx());
        return_shared(strategy);
    }
}

fun claim_withdrawal(test: &mut Scenario, env: &Env, user: address) {
    test.next_tx(user);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let out = strategy::claim_withdrawal(&mut strategy, &mut base, test.ctx());
        transfer::public_transfer(out, user);
        return_shared(strategy);
        return_shared(base);
    }
}

fun take_quote(test: &mut Scenario, user: address): u64 {
    test.next_tx(user);
    let out = test.take_from_sender<Coin<TEST_QUOTE>>();
    let value = out.value();
    transfer::public_transfer(out, user);
    value
}

fun set_grace(test: &mut Scenario, env: &Env, rounds: u64) {
    test.next_tx(ADMIN);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let cap = test.take_from_sender<StrategyAdminCap>();
        strategy::set_stale_grace(&mut strategy, &cap, rounds);
        return_shared(strategy);
        test.return_to_sender(cap);
    }
}

fun tamper_round_predict_id(test: &mut Scenario, env: &Env) {
    test.next_tx(ADMIN);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        strategy::set_active_round_predict_id_for_testing(&mut strategy, env.manager_id);
        return_shared(strategy);
    }
}

fun redeem_permissionless(test: &mut Scenario, env: &Env, sender: address, quantity: u64) {
    test.next_tx(sender);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, true);

        predict.redeem_permissionless<TEST_QUOTE>(&mut manager, &oracle, key, quantity, &clock, test.ctx());

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    }
}

fun mint_extra_same_market_position(test: &mut Scenario, env: &Env, quantity: u64) {
    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, true);
        let (ask_cost, _) = predict.get_trade_amounts(&oracle, key, quantity, &clock);

        manager.deposit<TEST_QUOTE>(coin::mint_for_testing<TEST_QUOTE>(ask_cost, test.ctx()), test.ctx());
        predict.mint<TEST_QUOTE>(&mut manager, &oracle, key, quantity, &clock, test.ctx());
        let refund = manager.balance<TEST_QUOTE>();
        if (refund > 0) {
            let refund_coin = manager.withdraw<TEST_QUOTE>(refund, test.ctx());
            transfer::public_transfer(refund_coin, ADMIN);
        };

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    }
}

fun setup_clock(test: &mut Scenario) {
    let clock = clock::create_for_testing(test.ctx());
    clock::share_for_testing(clock);
}

fun setup_predict(test: &mut Scenario, currency: &Currency<TEST_QUOTE>): ID {
    let mut registry = test.take_shared<Registry>();
    let admin_cap = test.take_from_sender<AdminCap>();
    let clock = test.take_shared<Clock>();
    let treasury_cap = coin::create_treasury_cap_for_testing<PLP>(test.ctx());
    let predict_id = registry::create_predict<TEST_QUOTE>(
        &mut registry,
        &admin_cap,
        currency,
        treasury_cap,
        &clock,
        test.ctx(),
    );
    return_shared(registry);
    return_shared(clock);
    test.return_to_sender(admin_cap);
    predict_id
}

fun seed_predict_liquidity(test: &mut Scenario, predict_id: ID) {
    test.next_tx(ADMIN);
    let mut predict = test.take_shared_by_id<Predict>(predict_id);
    let clock = test.take_shared<Clock>();
    let seed_plp = predict.supply<TEST_QUOTE>(
        coin::mint_for_testing<TEST_QUOTE>(SEED_LIQUIDITY, test.ctx()),
        &clock,
        test.ctx(),
    );
    transfer::public_transfer(seed_plp, ADMIN);
    return_shared(predict);
    return_shared(clock);
}

fun setup_oracle(test: &mut Scenario, predict_id: ID): ID {
    test.next_tx(ADMIN);
    let mut registry = test.take_shared<Registry>();
    let mut predict = test.take_shared_by_id<Predict>(predict_id);
    let admin_cap = test.take_from_sender<AdminCap>();
    let oracle_cap = registry::create_oracle_cap(&admin_cap, test.ctx());
    let oracle_id = registry::create_oracle(
        &mut registry,
        &mut predict,
        &admin_cap,
        &oracle_cap,
        b"BTC".to_string(),
        EXPIRY_MS,
        STRIKE,
        TICK_SIZE,
        test.ctx(),
    );
    return_shared(registry);
    return_shared(predict);
    test.return_to_sender(admin_cap);
    transfer::public_transfer(oracle_cap, ADMIN);
    oracle_id
}

fun activate_oracle(test: &mut Scenario, oracle_id: ID) {
    test.next_tx(ADMIN);
    let mut oracle = test.take_shared_by_id<OracleSVI>(oracle_id);
    let clock = test.take_shared<Clock>();
    let admin_cap = test.take_from_sender<AdminCap>();
    let oracle_cap = test.take_from_sender<OracleSVICap>();

    registry::register_oracle_cap(&mut oracle, &admin_cap, &oracle_cap);
    oracle::update_prices(&mut oracle, &oracle_cap, oracle::new_price_data(SPOT, SPOT), &clock);
    oracle::update_svi(
        &mut oracle,
        &oracle_cap,
        oracle::new_svi_params(
            100_000_000,
            100_000_000,
            i64::zero(),
            i64::zero(),
            100_000_000,
        ),
        &clock,
    );
    oracle::activate(&mut oracle, &oracle_cap, &clock);

    return_shared(oracle);
    return_shared(clock);
    test.return_to_sender(admin_cap);
    test.return_to_sender(oracle_cap);
}

fun settle_oracle(test: &mut Scenario, oracle_id: ID, settlement_price: u64) {
    test.next_tx(ADMIN);
    let mut oracle = test.take_shared_by_id<OracleSVI>(oracle_id);
    let mut clock = test.take_shared<Clock>();
    let oracle_cap = test.take_from_sender<OracleSVICap>();

    clock.set_for_testing(EXPIRY_MS);
    oracle::update_prices(&mut oracle, &oracle_cap, oracle::new_price_data(settlement_price, settlement_price), &clock);

    return_shared(oracle);
    return_shared(clock);
    test.return_to_sender(oracle_cap);
}

fun setup_manager(test: &mut Scenario, owner: address): ID {
    test.next_tx(owner);
    predict::create_manager(test.ctx())
}

fun seed_manager_balance(test: &mut Scenario, manager_id: ID, amount: u64) {
    test.next_tx(ADMIN);
    let mut manager = test.take_shared_by_id<PredictManager>(manager_id);
    manager.deposit<TEST_QUOTE>(coin::mint_for_testing<TEST_QUOTE>(amount, test.ctx()), test.ctx());
    return_shared(manager);
}

fun drain_manager_balance(test: &mut Scenario, manager_id: ID) {
    test.next_tx(ADMIN);
    let mut manager = test.take_shared_by_id<PredictManager>(manager_id);
    let amount = manager.balance<TEST_QUOTE>();
    let drained = manager.withdraw<TEST_QUOTE>(amount, test.ctx());
    transfer::public_transfer(drained, ADMIN);
    return_shared(manager);
}

fun deposit_as(test: &mut Scenario, env: &Env, user: address, amount: u64) {
    test.next_tx(user);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let funds = coin::mint_for_testing<TEST_QUOTE>(amount, test.ctx());

        let shares = strategy::deposit(&mut strategy, &mut base, funds, test.ctx());

        transfer::public_transfer(shares, user);
        return_shared(strategy);
        return_shared(base);
    }
}

fun default_policy(): policy::Policy {
    policy::new(PREMIUM_BUDGET_BPS, STRIKE_BAND_BPS, RESERVE_BPS, MAX_UP_ASK_BPS)
}
