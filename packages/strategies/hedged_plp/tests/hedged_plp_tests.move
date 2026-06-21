#[test_only]
module hedged_plp_strategy::hedged_plp_strategy_tests;

use hedged_plp_strategy::{
    policy,
    strategy::{Self as strategy, Strategy},
    hplp::HPLP,
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
const STRIKE: u64 = 90_000_000_000;
const TICK_SIZE: u64 = 10_000;
const DEPOSIT_AMOUNT: u64 = 10_000_000_000;
const SECOND_DEPOSIT_AMOUNT: u64 = 20_000_000_000;
const HEDGE_BUDGET_BPS: u16 = 1_000;
const STRIKE_BAND_BPS: u16 = 2_000;
const RESERVE_BPS: u16 = 1_000;
const MAX_PLP_ALLOCATION_BPS: u16 = 7_000;
const MAX_HEDGE_ASK_BPS: u64 = 10_000;
const HEDGE_QUANTITY: u64 = 10_000;
const SEED_LIQUIDITY: u64 = 1_000_000_000_000_000;
const MANAGER_BASELINE: u64 = 123_456_789;

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
    let treasury = coin::create_treasury_cap_for_testing<HPLP>(test.ctx());

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
    assert_eq!(strategy.nav(&base), 0);
    assert_eq!(strategy.share_supply(), 0);
    assert_eq!(strategy.cash_value(), 0);
    assert_eq!(strategy.plp_cost_basis(), 0);
    assert!(!strategy.has_active_round());
    assert!(!strategy.paused());
    assert_eq!(policy::hedge_budget_bps(&strategy.policy()), HEDGE_BUDGET_BPS);
    assert_eq!(policy::max_plp_allocation_bps(&strategy.policy()), MAX_PLP_ALLOCATION_BPS);
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
fun deposit_mints_strategy_shares_into_base() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);

    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    test.next_tx(USER);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let shares = test.take_from_sender<Coin<HPLP>>();

        assert_eq!(shares.value(), DEPOSIT_AMOUNT);
        assert_eq!(strategy.base_shares_amount(), DEPOSIT_AMOUNT);
        assert_eq!(strategy.cash_value(), 0);
        assert_eq!(base.cash_value(), DEPOSIT_AMOUNT);
        assert_eq!(strategy.nav(&base), DEPOSIT_AMOUNT);
        assert_eq!(strategy.share_supply(), DEPOSIT_AMOUNT);
        assert_eq!(strategy.plp_amount(), 0);

        transfer::public_transfer(shares, USER);
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
        assert_eq!(strategy.cash_value(), 0);
        assert_eq!(base.cash_value(), 30_000_000_000);
        assert_eq!(strategy.nav(&base), 30_000_000_000);
        assert_eq!(strategy.share_supply(), 30_000_000_000);
        return_shared(strategy);
        return_shared(base);
    };

    end(test);
}

#[test]
fun withdraw_burns_shares_and_returns_cash() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    test.next_tx(USER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let shares = test.take_from_sender<Coin<HPLP>>();

        let out = strategy::withdraw(&mut strategy, &mut base, shares, test.ctx());

        assert_eq!(out.value(), DEPOSIT_AMOUNT);
        assert_eq!(strategy.base_shares_amount(), 0);
        assert_eq!(strategy.cash_value(), 0);
        assert_eq!(strategy.share_supply(), 0);
        assert_eq!(base.cash_value(), 0);

        transfer::public_transfer(out, USER);
        return_shared(strategy);
        return_shared(base);
    };

    end(test);
}

#[test]
fun start_round_allocates_plp_and_opens_hedge() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, false);
        let round = option::destroy_some(strategy.active_round());

        assert!(strategy.has_active_round());
        assert_eq!(manager.position(key), HEDGE_QUANTITY);
        assert!(strategy.plp_amount() > 0);
        assert_eq!(strategy.plp_cost_basis(), 7_000_000_000);
        assert_eq!(strategy::round_predict_id(&round), env.predict_id);
        assert_eq!(strategy::round_oracle_id(&round), env.oracle_id);
        assert_eq!(strategy::round_strike(&round), STRIKE);
        assert_eq!(strategy::round_hedge_quantity(&round), HEDGE_QUANTITY);
        assert!(!strategy::round_settled(&round));

        return_shared(strategy);
        return_shared(manager);
    };

    end(test);
}

#[test, expected_failure(abort_code = 4)]
fun deposit_aborts_while_round_active() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);

    deposit_as(&mut test, &env, OTHER, SECOND_DEPOSIT_AMOUNT);

    abort
}

#[test, expected_failure(abort_code = 4)]
fun withdraw_aborts_while_round_active() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);

    test.next_tx(USER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let shares = test.take_from_sender<Coin<HPLP>>();
        let _out = strategy::withdraw(&mut strategy, &mut base, shares, test.ctx());
        return_shared(strategy);
        return_shared(base);
    };

    abort
}

#[test, expected_failure(abort_code = 4)]
fun cannot_start_second_round_before_realize() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);

    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);

    abort
}

#[test, expected_failure(abort_code = 11)]
fun start_round_aborts_on_non_downside_strike() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, SPOT, HEDGE_QUANTITY);

    abort
}

#[test, expected_failure(abort_code = 6)]
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
            HEDGE_QUANTITY,
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

    abort
}

#[test, expected_failure(abort_code = 16)]
fun start_round_aborts_when_ask_exceeds_policy_ceiling() {
    let mut test = begin(ADMIN);
    let restrictive_policy = policy::new(HEDGE_BUDGET_BPS, STRIKE_BAND_BPS, RESERVE_BPS, MAX_PLP_ALLOCATION_BPS, 1);
    let env = setup_strategy_with_policy(&mut test, restrictive_policy);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);

    abort
}

#[test]
fun settle_round_does_not_withdraw_plp_or_unlock_round() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);

    test.next_tx(ADMIN);
    let plp_before = {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let plp_before = strategy.plp_amount();
        return_shared(strategy);
        plp_before
    };

    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);

        let round = option::destroy_some(strategy.active_round());

        assert!(strategy.has_active_round());
        assert!(strategy::round_settled(&round));
        assert_eq!(strategy.plp_amount(), plp_before);
        assert_eq!(strategy.plp_cost_basis(), 7_000_000_000);
        assert_eq!(manager.balance<TEST_QUOTE>(), 0);

        return_shared(strategy);
        return_shared(manager);
    };

    end(test);
}

#[test]
fun realize_round_withdraws_plp_and_unlocks_withdrawals() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);
    settle_round(&mut test, &env);

    realize_round(&mut test, &env);

    test.next_tx(USER);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let shares = test.take_from_sender<Coin<HPLP>>();

        assert!(!strategy.has_active_round());
        assert_eq!(strategy.plp_amount(), 0);
        assert_eq!(strategy.plp_cost_basis(), 0);

        let out = strategy::withdraw(&mut strategy, &mut base, shares, test.ctx());
        assert!(out.value() > 0);
        assert_eq!(strategy.share_supply(), 0);
        assert_eq!(strategy.base_shares_amount(), 0);

        transfer::public_transfer(out, USER);
        return_shared(strategy);
        return_shared(base);
    };

    end(test);
}

#[test, expected_failure(abort_code = 27)]
fun realize_round_requires_settled_round() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);

    realize_round(&mut test, &env);

    abort
}

#[test, expected_failure(abort_code = 28)]
fun realize_round_requires_round_predict() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);
    settle_round(&mut test, &env);

    tamper_round_predict_id(&mut test, &env);
    realize_round(&mut test, &env);

    abort
}

#[test]
fun start_round_handles_large_nav_bps_math() {
    let mut test = begin(ADMIN);
    let restrictive_policy = policy::new(HEDGE_BUDGET_BPS, STRIKE_BAND_BPS, RESERVE_BPS, MAX_PLP_ALLOCATION_BPS, 8_000);
    let env = setup_strategy_with_policy(&mut test, restrictive_policy);
    deposit_as(&mut test, &env, USER, 10_000_000_000_000_000);

    start_round(&mut test, &env, STRIKE, 1_000_000_000_000_000);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        assert!(strategy.has_active_round());
        assert_eq!(strategy.plp_cost_basis(), 7_000_000_000_000_000);
        return_shared(strategy);
    };

    end(test);
}

#[test]
fun unwithdrawn_shares_can_enter_next_round() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);
    settle_round(&mut test, &env);
    realize_round(&mut test, &env);

    let next_oracle_id = setup_oracle_with_expiry(&mut test, env.predict_id, EXPIRY_MS * 2);
    activate_oracle(&mut test, next_oracle_id);
    let next_env = Env {
        base_vault_id: env.base_vault_id,
        strategy_id: env.strategy_id,
        predict_id: env.predict_id,
        manager_id: env.manager_id,
        oracle_id: next_oracle_id,
    };
    start_round(&mut test, &next_env, STRIKE, HEDGE_QUANTITY);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        assert!(strategy.has_active_round());
        assert_eq!(strategy.share_supply(), DEPOSIT_AMOUNT);

        return_shared(strategy);
    };

    end(test);
}

#[test, expected_failure(abort_code = 24)]
fun start_round_aborts_if_manager_not_empty() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    seed_manager_balance(&mut test, env.manager_id, MANAGER_BASELINE);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);

    abort
}

#[test]
fun settle_sweeps_post_start_manager_deposit() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);
    seed_manager_balance(&mut test, env.manager_id, MANAGER_BASELINE);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);

    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);

        assert!(strategy.has_active_round());
        assert_eq!(manager.balance<TEST_QUOTE>(), 0);
        assert!(strategy.cash_value() >= MANAGER_BASELINE);

        return_shared(strategy);
        return_shared(manager);
    };

    end(test);
}

#[test]
fun settle_sweeps_permissionless_redeem_plus_extra_balance() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);

    test.next_tx(OTHER);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, false);

        predict.redeem_permissionless<TEST_QUOTE>(&mut manager, &oracle, key, HEDGE_QUANTITY, &clock, test.ctx());

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };
    seed_manager_balance(&mut test, env.manager_id, MANAGER_BASELINE);

    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let round = option::destroy_some(strategy.active_round());

        assert!(strategy::round_settled(&round));
        assert_eq!(manager.balance<TEST_QUOTE>(), 0);
        assert!(strategy.cash_value() >= HEDGE_QUANTITY + MANAGER_BASELINE);

        return_shared(strategy);
        return_shared(manager);
    };

    end(test);
}

#[test]
fun settle_preserves_extra_same_market_position() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);
    mint_extra_same_market_position(&mut test, &env, HEDGE_QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);

    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, false);

        assert!(strategy.has_active_round());
        assert_eq!(manager.position(key), HEDGE_QUANTITY);

        return_shared(strategy);
        return_shared(manager);
    };

    end(test);
}

#[test, expected_failure(abort_code = 9)]
fun settle_round_requires_settled_oracle() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);

    settle_round(&mut test, &env);

    abort
}

#[test, expected_failure(abort_code = 28)]
fun settle_round_requires_round_predict() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);

    tamper_round_predict_id(&mut test, &env);
    settle_round(&mut test, &env);

    abort
}

#[test]
fun settle_sweeps_payout_after_permissionless_redeem() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);

    test.next_tx(OTHER);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, false);

        predict.redeem_permissionless<TEST_QUOTE>(&mut manager, &oracle, key, HEDGE_QUANTITY, &clock, test.ctx());

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };

    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, false);
        let round = option::destroy_some(strategy.active_round());

        assert!(strategy::round_settled(&round));
        assert_eq!(manager.position(key), 0);
        assert_eq!(manager.balance<TEST_QUOTE>(), 0);

        return_shared(strategy);
        return_shared(manager);
    };

    end(test);
}

#[test, expected_failure(abort_code = 20)]
fun settle_aborts_if_redeemed_payout_is_missing() {
    let mut test = begin(ADMIN);
    let env = setup_strategy(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, STRIKE, HEDGE_QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, false);

        predict.redeem_permissionless<TEST_QUOTE>(&mut manager, &oracle, key, HEDGE_QUANTITY, &clock, test.ctx());
        let manager_balance = manager.balance<TEST_QUOTE>();
        let stolen = manager.withdraw<TEST_QUOTE>(manager_balance, test.ctx());

        transfer::public_transfer(stolen, ADMIN);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };

    settle_round(&mut test, &env);

    abort
}

#[test, expected_failure(abort_code = 1)]
fun invalid_policy_aborts() {
    policy::new(HEDGE_BUDGET_BPS, STRIKE_BAND_BPS, RESERVE_BPS, 0, MAX_HEDGE_ASK_BPS);
    abort
}

#[test, expected_failure(abort_code = 1)]
fun invalid_combined_policy_budget_aborts() {
    policy::new(3_000, STRIKE_BAND_BPS, 3_000, 5_000, MAX_HEDGE_ASK_BPS);
    abort
}

#[test, expected_failure(abort_code = 2)]
fun wrong_strategy_cap_cannot_set_policy() {
    let mut test = begin(ADMIN);
    let manager_id = setup_manager(&mut test, ADMIN);

    test.next_tx(ADMIN);
    let manager = test.take_shared_by_id<PredictManager>(manager_id);
    let base_treasury = coin::create_treasury_cap_for_testing<BASE_VAULT>(test.ctx());
    let (base, base_cap) = base_vault::create_vault<TEST_QUOTE>(base_treasury, test.ctx());
    let first_treasury = coin::create_treasury_cap_for_testing<HPLP>(test.ctx());
    let second_treasury = coin::create_treasury_cap_for_testing<HPLP>(test.ctx());
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
    let treasury = coin::create_treasury_cap_for_testing<HPLP>(test.ctx());
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
        let cap = test.take_from_sender<strategy::StrategyKeeperCap>();
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        strategy::settle_round(&mut strategy, &cap, &mut predict, &mut manager, &oracle, &clock, test.ctx());

        return_shared(strategy);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
        test.return_to_sender(cap);
    }
}

fun realize_round(test: &mut Scenario, env: &Env) {
    test.next_tx(ADMIN);
    {
        let mut strategy = test.take_shared_by_id<Strategy<TEST_QUOTE>>(env.strategy_id);
        let mut base = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(env.base_vault_id);
        let cap = test.take_from_sender<strategy::StrategyKeeperCap>();
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let clock = test.take_shared<Clock>();

        strategy::realize_round(&mut strategy, &mut base, &cap, &mut predict, &clock, test.ctx());

        return_shared(strategy);
        return_shared(base);
        return_shared(predict);
        return_shared(clock);
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

fun mint_extra_same_market_position(test: &mut Scenario, env: &Env, quantity: u64) {
    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, false);
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
    setup_oracle_with_expiry(test, predict_id, EXPIRY_MS)
}

fun setup_oracle_with_expiry(test: &mut Scenario, predict_id: ID, expiry_ms: u64): ID {
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
        expiry_ms,
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
    policy::new(HEDGE_BUDGET_BPS, STRIKE_BAND_BPS, RESERVE_BPS, MAX_PLP_ALLOCATION_BPS, MAX_HEDGE_ASK_BPS)
}
