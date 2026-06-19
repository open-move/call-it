#[test_only]
module range_ladder::range_ladder_tests;

use deepbook_predict::{
    i64,
    oracle::{Self, OracleSVI, OracleSVICap},
    plp::PLP,
    predict::{Self, Predict},
    predict_manager::PredictManager,
    range_key,
    registry::{Self, AdminCap, Registry},
};
use range_ladder::{
    policy,
    range_ladder::{Self, RANGE_LADDER, RangeLadderVault},
    test_quote::{Self, TEST_QUOTE},
};
use std::{option, unit_test::{assert_eq, destroy}};
use sui::{
    clock::{Self, Clock},
    coin::{Self, Coin},
    coin_registry::Currency,
    object::ID,
    test_scenario::{begin, end, return_shared, Scenario},
    transfer,
};

const ADMIN: address = @0xA;
const USER: address = @0xB;
const OTHER: address = @0xC;

const EXPIRY_MS: u64 = 1_000_000;
const SPOT: u64 = 100_000_000_000;
const SETTLEMENT_SPOT: u64 = 95_000_000_000;
const MIN_STRIKE: u64 = 80_000_000_000;
const LOWER_STRIKE: u64 = 90_000_000_000;
const MID_STRIKE: u64 = 100_000_000_000;
const HIGHER_STRIKE: u64 = 110_000_000_000;
const TICK_SIZE: u64 = 1_000_000;
const DEPOSIT_AMOUNT: u64 = 10_000_000_000;
const SECOND_DEPOSIT_AMOUNT: u64 = 20_000_000_000;
const PREMIUM_BUDGET_BPS: u16 = 1_000;
const RESERVE_BPS: u16 = 1_000;
const MAX_RANGE_ASK_BPS: u64 = 10_000;
const MAX_RUNG_COUNT: u64 = 16;
const RUNG_QUANTITY: u64 = 10_000;
const SEED_LIQUIDITY: u64 = 1_000_000_000_000_000;
const MANAGER_BASELINE: u64 = 123_456_789;

public struct Env has drop {
    vault_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
}

#[test]
fun create_vault_sets_policy_cap_and_manager() {
    let mut test = begin(ADMIN);
    setup_clock(&mut test);
    let manager_id = setup_manager(&mut test, ADMIN);

    test.next_tx(ADMIN);
    {
        let manager = test.take_shared_by_id<PredictManager>(manager_id);
        let treasury = coin::create_treasury_cap_for_testing<RANGE_LADDER>(test.ctx());
        let (vault, cap) = range_ladder::create_vault<TEST_QUOTE>(
            treasury,
            &manager,
            default_policy(),
            test.ctx(),
        );
        let vault_id = vault.id();

        assert_eq!(vault.manager_id(), manager_id);
        assert_eq!(vault.nav(), 0);
        assert_eq!(vault.share_supply(), 0);
        assert_eq!(vault.cash_value(), 0);
        assert!(!vault.has_active_round());
        assert!(!vault.paused());
        assert_eq!(policy::premium_budget_bps(&vault.policy()), PREMIUM_BUDGET_BPS);
        assert_eq!(range_ladder::cap_vault_id(&cap), vault_id);

        range_ladder::share_vault(vault);
        range_ladder::destroy_cap_for_testing(cap);
        return_shared(manager);
    };

    end(test);
}

#[test]
fun deposit_mints_vault_shares_into_cash() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);

    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    test.next_tx(USER);
    {
        let vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        let shares = test.take_from_sender<Coin<RANGE_LADDER>>();

        assert_eq!(shares.value(), DEPOSIT_AMOUNT);
        assert_eq!(vault.cash_value(), DEPOSIT_AMOUNT);
        assert_eq!(vault.nav(), DEPOSIT_AMOUNT);
        assert_eq!(vault.share_supply(), DEPOSIT_AMOUNT);

        transfer::public_transfer(shares, USER);
        return_shared(vault);
    };

    end(test);
}

#[test]
fun multiple_deposits_mint_proportional_shares() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);

    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    deposit_as(&mut test, &env, OTHER, SECOND_DEPOSIT_AMOUNT);

    test.next_tx(ADMIN);
    {
        let vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        assert_eq!(vault.cash_value(), 30_000_000_000);
        assert_eq!(vault.nav(), 30_000_000_000);
        assert_eq!(vault.share_supply(), 30_000_000_000);
        return_shared(vault);
    };

    end(test);
}

#[test]
fun withdraw_burns_shares_and_returns_cash() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    test.next_tx(USER);
    {
        let mut vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        let shares = test.take_from_sender<Coin<RANGE_LADDER>>();
        let out = range_ladder::withdraw(&mut vault, shares, test.ctx());

        assert_eq!(out.value(), DEPOSIT_AMOUNT);
        assert_eq!(vault.cash_value(), 0);
        assert_eq!(vault.share_supply(), 0);

        transfer::public_transfer(out, USER);
        return_shared(vault);
    };

    end(test);
}

#[test]
fun start_round_mints_exact_ranges_and_refunds_budget() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, default_rungs());

    test.next_tx(ADMIN);
    {
        let vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let first_key = first_range_key(&oracle);
        let second_key = second_range_key(&oracle);
        let round = option::destroy_some(vault.active_round());

        assert!(vault.has_active_round());
        assert_eq!(manager.range_position(first_key), RUNG_QUANTITY);
        assert_eq!(manager.range_position(second_key), RUNG_QUANTITY);
        assert_eq!(manager.balance<TEST_QUOTE>(), 0);
        assert_eq!(range_ladder::round_predict_id(&round), env.predict_id);
        assert_eq!(range_ladder::round_oracle_id(&round), env.oracle_id);
        assert_eq!(range_ladder::round_position_count(&round), 2);
        assert!(vault.cash_value() > DEPOSIT_AMOUNT - 1_000_000_000);
        assert_eq!(vault.share_supply(), DEPOSIT_AMOUNT);

        return_shared(vault);
        return_shared(manager);
        return_shared(oracle);
    };

    end(test);
}

#[test, expected_failure(abort_code = 3)]
fun deposit_aborts_while_round_active() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, default_rungs());

    deposit_as(&mut test, &env, OTHER, SECOND_DEPOSIT_AMOUNT);

    abort
}

#[test, expected_failure(abort_code = 3)]
fun withdraw_aborts_while_round_active() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, default_rungs());

    test.next_tx(USER);
    {
        let mut vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        let shares = test.take_from_sender<Coin<RANGE_LADDER>>();
        let _out = range_ladder::withdraw(&mut vault, shares, test.ctx());
        return_shared(vault);
    };

    abort
}

#[test, expected_failure(abort_code = 3)]
fun cannot_start_second_round_before_settle() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, default_rungs());

    start_round(&mut test, &env, default_rungs());

    abort
}

#[test, expected_failure(abort_code = 5)]
fun start_round_aborts_on_wrong_manager() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    let other_manager_id = setup_manager(&mut test, OTHER);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    test.next_tx(ADMIN);
    {
        let mut vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        let cap = test.take_from_sender<range_ladder::VaultCap>();
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(other_manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        range_ladder::start_round(&mut vault, &cap, &mut predict, &mut manager, &oracle, default_rungs(), &clock, test.ctx());

        return_shared(vault);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
        test.return_to_sender(cap);
    };

    abort
}

#[test, expected_failure(abort_code = 7)]
fun start_round_aborts_if_manager_not_empty() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    seed_manager_balance(&mut test, env.manager_id, MANAGER_BASELINE);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, default_rungs());

    abort
}

#[test, expected_failure(abort_code = 8)]
fun start_round_requires_active_oracle() {
    let mut test = begin(ADMIN);
    let env = setup_vault_inactive(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, default_rungs());

    abort
}

#[test, expected_failure(abort_code = 16)]
fun start_round_enforces_range_ask_ceiling() {
    let mut test = begin(ADMIN);
    let restrictive_policy = policy::new(PREMIUM_BUDGET_BPS, RESERVE_BPS, 1, MAX_RUNG_COUNT);
    let env = setup_vault_with_policy(&mut test, restrictive_policy, true);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, default_rungs());

    abort
}

#[test]
fun settle_round_redeems_ranges_clears_round_and_unlocks_withdrawals() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, default_rungs());
    settle_oracle(&mut test, env.oracle_id, SETTLEMENT_SPOT);

    settle_round(&mut test, &env);

    test.next_tx(USER);
    {
        let mut vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        let shares = test.take_from_sender<Coin<RANGE_LADDER>>();

        assert!(!vault.has_active_round());
        assert!(vault.cash_value() > 0);

        let out = range_ladder::withdraw(&mut vault, shares, test.ctx());
        assert!(out.value() > 0);
        assert_eq!(vault.share_supply(), 0);

        transfer::public_transfer(out, USER);
        return_shared(vault);
    };

    end(test);
}

#[test, expected_failure(abort_code = 9)]
fun settle_round_requires_settled_oracle() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, default_rungs());

    settle_round(&mut test, &env);

    abort
}

#[test, expected_failure(abort_code = 10)]
fun settle_round_requires_round_predict() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, default_rungs());
    settle_oracle(&mut test, env.oracle_id, SETTLEMENT_SPOT);
    tamper_round_predict_id(&mut test, &env);

    settle_round(&mut test, &env);

    abort
}

#[test, expected_failure(abort_code = 11)]
fun settle_round_requires_round_oracle() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, default_rungs());

    let wrong_oracle_id = setup_oracle_with_expiry(&mut test, env.predict_id, EXPIRY_MS);
    activate_oracle(&mut test, wrong_oracle_id);
    settle_oracle(&mut test, wrong_oracle_id, SETTLEMENT_SPOT);
    let wrong_env = Env { vault_id: env.vault_id, predict_id: env.predict_id, manager_id: env.manager_id, oracle_id: wrong_oracle_id };

    settle_round(&mut test, &wrong_env);

    abort
}

#[test, expected_failure(abort_code = 18)]
fun settle_aborts_when_range_position_was_increased() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, default_rungs());
    mint_extra_same_range_position(&mut test, &env, 1);
    settle_oracle(&mut test, env.oracle_id, SETTLEMENT_SPOT);

    settle_round(&mut test, &env);

    abort
}

#[test, expected_failure(abort_code = 18)]
fun settle_aborts_when_range_position_was_decreased() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, default_rungs());
    redeem_one_range_before_settle(&mut test, &env);
    settle_oracle(&mut test, env.oracle_id, SETTLEMENT_SPOT);

    settle_round(&mut test, &env);

    abort
}

#[test]
fun settle_preserves_post_start_manager_deposit() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, default_rungs());
    seed_manager_balance(&mut test, env.manager_id, MANAGER_BASELINE);
    settle_oracle(&mut test, env.oracle_id, SETTLEMENT_SPOT);

    settle_round(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        let manager = test.take_shared_by_id<PredictManager>(env.manager_id);

        assert!(!vault.has_active_round());
        assert_eq!(manager.balance<TEST_QUOTE>(), MANAGER_BASELINE);

        return_shared(vault);
        return_shared(manager);
    };

    end(test);
}

#[test]
fun unwithdrawn_shares_can_enter_next_round() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    start_round(&mut test, &env, default_rungs());
    settle_oracle(&mut test, env.oracle_id, SETTLEMENT_SPOT);
    settle_round(&mut test, &env);

    let next_oracle_id = setup_oracle_with_expiry(&mut test, env.predict_id, EXPIRY_MS * 2);
    activate_oracle(&mut test, next_oracle_id);
    let next_env = Env { vault_id: env.vault_id, predict_id: env.predict_id, manager_id: env.manager_id, oracle_id: next_oracle_id };
    start_round(&mut test, &next_env, default_rungs());

    test.next_tx(ADMIN);
    {
        let vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        assert!(vault.has_active_round());
        assert_eq!(vault.share_supply(), DEPOSIT_AMOUNT);
        return_shared(vault);
    };

    end(test);
}

#[test]
fun start_round_handles_large_nav_bps_math() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, 10_000_000_000_000_000);

    start_round(&mut test, &env, default_rungs());

    test.next_tx(ADMIN);
    {
        let vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        assert!(vault.has_active_round());
        assert!(vault.cash_value() > 9_000_000_000_000_000);
        return_shared(vault);
    };

    end(test);
}

#[test, expected_failure(abort_code = 4)]
fun new_rung_aborts_on_invalid_strike_order() {
    let _rung = policy::new_rung(MID_STRIKE, LOWER_STRIKE, RUNG_QUANTITY);
}

#[test, expected_failure(abort_code = 4)]
fun new_rung_aborts_on_zero_quantity() {
    let _rung = policy::new_rung(LOWER_STRIKE, MID_STRIKE, 0);
}

#[test, expected_failure(abort_code = 2)]
fun start_round_aborts_on_empty_ladder() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);

    start_round(&mut test, &env, vector[]);

    abort
}

#[test, expected_failure(abort_code = 3)]
fun start_round_aborts_on_too_many_rungs() {
    let mut test = begin(ADMIN);
    let env = setup_vault(&mut test);
    deposit_as(&mut test, &env, USER, DEPOSIT_AMOUNT);
    let mut rungs = vector[];
    17u64.do!(|_| rungs.push_back(policy::new_rung(LOWER_STRIKE, MID_STRIKE, RUNG_QUANTITY)));

    start_round(&mut test, &env, rungs);

    abort
}

#[test, expected_failure(abort_code = 1)]
fun invalid_policy_aborts() {
    policy::new(0, RESERVE_BPS, MAX_RANGE_ASK_BPS, MAX_RUNG_COUNT);
    abort
}

#[test, expected_failure(abort_code = 1)]
fun invalid_combined_policy_budget_aborts() {
    policy::new(6_000, 5_000, MAX_RANGE_ASK_BPS, MAX_RUNG_COUNT);
    abort
}

#[test, expected_failure(abort_code = 2)]
fun wrong_vault_cap_cannot_set_policy() {
    let mut test = begin(ADMIN);
    setup_clock(&mut test);
    let manager_id = setup_manager(&mut test, ADMIN);

    test.next_tx(ADMIN);
    let manager = test.take_shared_by_id<PredictManager>(manager_id);
    let first_treasury = coin::create_treasury_cap_for_testing<RANGE_LADDER>(test.ctx());
    let second_treasury = coin::create_treasury_cap_for_testing<RANGE_LADDER>(test.ctx());
    let (mut first_vault, first_cap) = range_ladder::create_vault<TEST_QUOTE>(
        first_treasury,
        &manager,
        default_policy(),
        test.ctx(),
    );
    let (_second_vault, second_cap) = range_ladder::create_vault<TEST_QUOTE>(
        second_treasury,
        &manager,
        default_policy(),
        test.ctx(),
    );

    range_ladder::set_policy(&mut first_vault, &second_cap, default_policy());

    range_ladder::destroy_cap_for_testing(first_cap);
    range_ladder::destroy_cap_for_testing(second_cap);
    abort
}

fun default_rungs(): vector<policy::RangeRung> {
    vector[
        policy::new_rung(LOWER_STRIKE, MID_STRIKE, RUNG_QUANTITY),
        policy::new_rung(MID_STRIKE, HIGHER_STRIKE, RUNG_QUANTITY),
    ]
}

fun setup_vault(test: &mut Scenario): Env {
    setup_vault_with_policy(test, default_policy(), true)
}

fun setup_vault_inactive(test: &mut Scenario): Env {
    setup_vault_with_policy(test, default_policy(), false)
}

fun setup_vault_with_policy(test: &mut Scenario, vault_policy: policy::RangeLadderPolicy, activate: bool): Env {
    setup_clock(test);
    let currency = test_quote::create_currency(test.ctx());
    registry::init_for_testing(test.ctx());

    test.next_tx(ADMIN);
    let predict_id = setup_predict(test, &currency);
    destroy(currency);
    seed_vault(test, predict_id);
    let oracle_id = setup_oracle(test, predict_id);
    if (activate) {
        activate_oracle(test, oracle_id);
    };
    let manager_id = setup_manager(test, ADMIN);

    test.next_tx(ADMIN);
    let treasury = coin::create_treasury_cap_for_testing<RANGE_LADDER>(test.ctx());
    let manager = test.take_shared_by_id<PredictManager>(manager_id);
    let (vault, cap) = range_ladder::create_vault<TEST_QUOTE>(
        treasury,
        &manager,
        vault_policy,
        test.ctx(),
    );
    let vault_id = vault.id();
    range_ladder::share_vault(vault);
    transfer::public_transfer(cap, ADMIN);
    return_shared(manager);

    Env { vault_id, predict_id, manager_id, oracle_id }
}

fun start_round(test: &mut Scenario, env: &Env, rungs: vector<policy::RangeRung>) {
    test.next_tx(ADMIN);
    {
        let mut vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        let cap = test.take_from_sender<range_ladder::VaultCap>();
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        range_ladder::start_round(&mut vault, &cap, &mut predict, &mut manager, &oracle, rungs, &clock, test.ctx());

        return_shared(vault);
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
        let mut vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        let cap = test.take_from_sender<range_ladder::VaultCap>();
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        range_ladder::settle_round(&mut vault, &cap, &mut predict, &mut manager, &oracle, &clock, test.ctx());

        return_shared(vault);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
        test.return_to_sender(cap);
    }
}

fun tamper_round_predict_id(test: &mut Scenario, env: &Env) {
    test.next_tx(ADMIN);
    {
        let mut vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        range_ladder::set_active_round_predict_id_for_testing(&mut vault, env.manager_id);
        return_shared(vault);
    }
}

fun mint_extra_same_range_position(test: &mut Scenario, env: &Env, quantity: u64) {
    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = first_range_key(&oracle);
        let (ask_cost, _) = predict.get_range_trade_amounts(&oracle, key, quantity, &clock);

        manager.deposit<TEST_QUOTE>(coin::mint_for_testing<TEST_QUOTE>(ask_cost, test.ctx()), test.ctx());
        predict.mint_range<TEST_QUOTE>(&mut manager, &oracle, key, quantity, &clock, test.ctx());
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

fun redeem_one_range_before_settle(test: &mut Scenario, env: &Env) {
    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = first_range_key(&oracle);

        predict.redeem_range<TEST_QUOTE>(&mut manager, &oracle, key, 1, &clock, test.ctx());
        let balance = manager.balance<TEST_QUOTE>();
        if (balance > 0) {
            let payout = manager.withdraw<TEST_QUOTE>(balance, test.ctx());
            transfer::public_transfer(payout, ADMIN);
        };

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    }
}

fun seed_vault(test: &mut Scenario, predict_id: ID) {
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
        MIN_STRIKE,
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
        let mut vault = test.take_shared_by_id<RangeLadderVault<TEST_QUOTE>>(env.vault_id);
        let funds = coin::mint_for_testing<TEST_QUOTE>(amount, test.ctx());
        let shares = range_ladder::deposit(&mut vault, funds, test.ctx());

        transfer::public_transfer(shares, user);
        return_shared(vault);
    }
}

fun first_range_key(oracle: &OracleSVI): range_key::RangeKey {
    range_key::new(oracle.id(), oracle.expiry(), LOWER_STRIKE, MID_STRIKE)
}

fun second_range_key(oracle: &OracleSVI): range_key::RangeKey {
    range_key::new(oracle.id(), oracle.expiry(), MID_STRIKE, HIGHER_STRIKE)
}

fun default_policy(): policy::RangeLadderPolicy {
    policy::new(PREMIUM_BUDGET_BPS, RESERVE_BPS, MAX_RANGE_ASK_BPS, MAX_RUNG_COUNT)
}
