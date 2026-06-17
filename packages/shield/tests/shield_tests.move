#[test_only]
module shield::shield_tests;

use deepbook_predict::{
    i64,
    market_key,
    oracle::{Self, OracleSVI, OracleSVICap},
    plp::PLP,
    predict::{Self, Predict},
    predict_manager::PredictManager,
    registry::{Self, AdminCap, Registry},
};
use shield::{
    policy::ShieldPolicy,
    shield,
    test_quote::{Self, TEST_QUOTE},
};
use std::unit_test::{assert_eq, destroy};
use sui::{
    clock::{Self, Clock},
    coin,
    coin_registry::Currency,
    object::{Self, ID},
    test_scenario::{begin, end, return_shared, Scenario},
    transfer,
};

const ADMIN: address = @0xA;
const KEEPER: address = @0xC;

const EXPIRY_MS: u64 = 1_000_000;
const SPOT: u64 = 100_000_000_000;
const SETTLEMENT_SPOT: u64 = 80_000_000_000;
const STRIKE: u64 = 90_000_000_000;
const TICK_SIZE: u64 = 10_000;
const DEPOSIT_AMOUNT: u64 = 10_000_000_000;
const HEDGE_BUDGET: u64 = 5_000_000_000;
const MAX_LOSS_BPS: u16 = 5000;
const HEDGE_QUANTITY: u64 = 10_000;
const SEED_LIQUIDITY: u64 = 1_000_000_000_000_000;

public struct Env has drop {
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
}

#[test]
fun open_creates_owned_policy_plp_and_exact_hedge() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = down_key(&oracle);

        seed_vault(&mut predict, &clock, &mut test);
        let payment = coin::mint_for_testing<TEST_QUOTE>(DEPOSIT_AMOUNT, test.ctx());
        let (policy, refund) = shield::open<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            payment,
            HEDGE_BUDGET,
            MAX_LOSS_BPS,
            STRIKE,
            HEDGE_QUANTITY,
            &clock,
            test.ctx(),
        );

        assert_eq!(manager.position(key), HEDGE_QUANTITY);
        assert_eq!(policy.key(), key);
        assert_eq!(policy.quantity(), HEDGE_QUANTITY);
        assert!(policy.plp_amount() > 0);
        coin::burn_for_testing(refund);
        transfer::public_transfer(policy, ADMIN);

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };

    end(test);
}

#[test]
fun claim_consumes_policy_redeems_hedge_and_withdraws_plp() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env, ADMIN);
    settle_oracle(&mut test, env.oracle_id);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let policy = test.take_from_sender<ShieldPolicy<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let key = down_key(&oracle);

        let payout = shield::claim<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            policy,
            &clock,
            test.ctx(),
        );

        assert_eq!(manager.position(key), 0);
        assert!(payout.value() > 0);
        coin::burn_for_testing(payout);

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun open_aborts_when_same_key_position_exists() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = down_key(&oracle);

        seed_vault(&mut predict, &clock, &mut test);
        manager.deposit<TEST_QUOTE>(coin::mint_for_testing<TEST_QUOTE>(HEDGE_BUDGET, test.ctx()), test.ctx());
        predict.mint<TEST_QUOTE>(&mut manager, &oracle, key, HEDGE_QUANTITY, &clock, test.ctx());

        let payment = coin::mint_for_testing<TEST_QUOTE>(DEPOSIT_AMOUNT, test.ctx());
        let (policy, refund) = shield::open<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            payment,
            HEDGE_BUDGET,
            MAX_LOSS_BPS,
            STRIKE,
            HEDGE_QUANTITY,
            &clock,
            test.ctx(),
        );
        transfer::public_transfer(policy, ADMIN);
        coin::burn_for_testing(refund);

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun open_aborts_on_invalid_down_strike() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    attempt_open(&mut test, &env, ADMIN, DEPOSIT_AMOUNT, HEDGE_BUDGET, MAX_LOSS_BPS, SPOT, HEDGE_QUANTITY);
    end(test);
}

#[test, expected_failure]
fun open_aborts_on_zero_hedge_budget() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    attempt_open(&mut test, &env, ADMIN, DEPOSIT_AMOUNT, 0, MAX_LOSS_BPS, STRIKE, HEDGE_QUANTITY);
    end(test);
}

#[test, expected_failure]
fun open_aborts_when_hedge_budget_is_deposit() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    attempt_open(&mut test, &env, ADMIN, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, MAX_LOSS_BPS, STRIKE, HEDGE_QUANTITY);
    end(test);
}

#[test, expected_failure]
fun open_aborts_when_hedge_budget_exceeds_max_loss() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    attempt_open(&mut test, &env, ADMIN, DEPOSIT_AMOUNT, HEDGE_BUDGET + 1, MAX_LOSS_BPS, STRIKE, HEDGE_QUANTITY);
    end(test);
}

#[test, expected_failure]
fun open_aborts_on_zero_hedge_quantity() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    attempt_open(&mut test, &env, ADMIN, DEPOSIT_AMOUNT, HEDGE_BUDGET, MAX_LOSS_BPS, STRIKE, 0);
    end(test);
}

#[test, expected_failure]
fun open_aborts_when_oracle_inactive() {
    let mut test = begin(ADMIN);
    let env = setup_inactive(&mut test);
    attempt_open(&mut test, &env, ADMIN, DEPOSIT_AMOUNT, HEDGE_BUDGET, MAX_LOSS_BPS, STRIKE, HEDGE_QUANTITY);
    end(test);
}

#[test, expected_failure]
fun open_aborts_for_non_manager_owner() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    attempt_open(&mut test, &env, KEEPER, DEPOSIT_AMOUNT, HEDGE_BUDGET, MAX_LOSS_BPS, STRIKE, HEDGE_QUANTITY);
    end(test);
}

#[test, expected_failure]
fun claim_aborts_when_hedge_position_was_increased() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env, ADMIN);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = down_key(&oracle);

        manager.deposit<TEST_QUOTE>(coin::mint_for_testing<TEST_QUOTE>(HEDGE_BUDGET, test.ctx()), test.ctx());
        predict.mint<TEST_QUOTE>(&mut manager, &oracle, key, 1, &clock, test.ctx());

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };

    settle_oracle(&mut test, env.oracle_id);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let policy = test.take_from_sender<ShieldPolicy<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();

        let payout = shield::claim<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            policy,
            &clock,
            test.ctx(),
        );
        coin::burn_for_testing(payout);

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };

    end(test);
}

fun seed_vault(predict: &mut Predict, clock: &Clock, test: &mut Scenario) {
    let seed_plp = predict::supply<TEST_QUOTE>(
        predict,
        coin::mint_for_testing<TEST_QUOTE>(SEED_LIQUIDITY, test.ctx()),
        clock,
        test.ctx(),
    );
    transfer::public_transfer(seed_plp, ADMIN);
}

fun open_policy(test: &mut Scenario, env: &Env, recipient: address) {
    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        seed_vault(&mut predict, &clock, test);
        let payment = coin::mint_for_testing<TEST_QUOTE>(DEPOSIT_AMOUNT, test.ctx());
        let (policy, refund) = shield::open<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            payment,
            HEDGE_BUDGET,
            MAX_LOSS_BPS,
            STRIKE,
            HEDGE_QUANTITY,
            &clock,
            test.ctx(),
        );
        transfer::public_transfer(policy, recipient);
        coin::burn_for_testing(refund);

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    }
}

fun attempt_open(
    test: &mut Scenario,
    env: &Env,
    sender: address,
    deposit_amount: u64,
    hedge_budget_amount: u64,
    max_loss_bps: u16,
    hedge_strike: u64,
    hedge_quantity: u64,
) {
    test.next_tx(sender);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        seed_vault(&mut predict, &clock, test);
        let payment = coin::mint_for_testing<TEST_QUOTE>(deposit_amount, test.ctx());
        let (policy, refund) = shield::open<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            payment,
            hedge_budget_amount,
            max_loss_bps,
            hedge_strike,
            hedge_quantity,
            &clock,
            test.ctx(),
        );
        transfer::public_transfer(policy, sender);
        coin::burn_for_testing(refund);

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    }
}

fun settle_oracle(test: &mut Scenario, oracle_id: ID) {
    test.next_tx(ADMIN);
    {
        let mut oracle = test.take_shared_by_id<OracleSVI>(oracle_id);
        let mut clock = test.take_shared<Clock>();
        let oracle_cap = test.take_from_sender<OracleSVICap>();

        clock.set_for_testing(EXPIRY_MS);
        oracle::update_prices(
            &mut oracle,
            &oracle_cap,
            oracle::new_price_data(SETTLEMENT_SPOT, SETTLEMENT_SPOT),
            &clock,
        );

        return_shared(oracle);
        return_shared(clock);
        test.return_to_sender(oracle_cap);
    }
}

fun setup(test: &mut Scenario): Env {
    let env = setup_inactive(test);
    activate_oracle(test, env.oracle_id);
    env
}

fun setup_inactive(test: &mut Scenario): Env {
    setup_clock(test);
    let currency = test_quote::create_currency(test.ctx());

    registry::init_for_testing(test.ctx());

    test.next_tx(ADMIN);
    let predict_id = setup_predict(test, &currency);
    destroy(currency);

    let oracle_id = setup_oracle(test, predict_id);
    let manager_id = setup_manager(test);

    Env { predict_id, manager_id, oracle_id }
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

fun setup_manager(test: &mut Scenario): ID {
    test.next_tx(ADMIN);
    predict::create_manager(test.ctx())
}

fun down_key(oracle: &OracleSVI): market_key::MarketKey {
    market_key::new(oracle.id(), oracle.expiry(), STRIKE, false)
}
