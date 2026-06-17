#[test_only]
module range_ladder::range_ladder_tests;

use deepbook_predict::{
    i64,
    plp::PLP,
    predict::{Self, Predict},
    predict_manager::{Self, PredictManager},
    range_key,
    oracle::{Self, OracleSVI, OracleSVICap},
    registry::{Self, AdminCap, Registry},
};
use range_ladder::{
    policy::{Self, RangeLadderOwnerCap, RangeLadderPolicy},
    range_ladder,
    test_quote::{Self, TEST_QUOTE},
};
use std::unit_test::{assert_eq, destroy};
use sui::{
    clock::{Self, Clock},
    coin::{Self, Coin},
    coin_registry::Currency,
    object::{Self, ID},
    test_scenario::{begin, end, return_shared, Scenario},
    transfer,
};

const ADMIN: address = @0xA;
const BENEFICIARY: address = @0xB;
const KEEPER: address = @0xC;

const EXPIRY_MS: u64 = 1_000_000;
const SPOT: u64 = 100_000_000_000;
const SETTLEMENT_SPOT: u64 = 95_000_000_000;
const MIN_STRIKE: u64 = 80_000_000_000;
const LOWER_STRIKE: u64 = 90_000_000_000;
const MID_STRIKE: u64 = 100_000_000_000;
const HIGHER_STRIKE: u64 = 110_000_000_000;
const TICK_SIZE: u64 = 1_000_000;
const PREMIUM_AMOUNT: u64 = 100_000_000_000;
const EXISTING_MANAGER_BALANCE: u64 = 123_456_789;
const RUNG_QUANTITY: u64 = 10_000;
const SEED_LIQUIDITY: u64 = 1_000_000_000_000_000;

public struct Env has drop {
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
}

#[test]
fun open_creates_policy_and_exact_range_positions() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let first_key = first_range_key(&oracle);
        let second_key = second_range_key(&oracle);

        assert_eq!(manager.range_position(first_key), 0);
        assert_eq!(manager.range_position(second_key), 0);

        seed_vault(&mut predict, &clock, &mut test);
        let payment = coin::mint_for_testing<TEST_QUOTE>(PREMIUM_AMOUNT, test.ctx());
        let (cap, refund) = range_ladder::open<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            payment,
            BENEFICIARY,
            default_rungs(),
            &clock,
            test.ctx(),
        );

        assert_eq!(manager.range_position(first_key), RUNG_QUANTITY);
        assert_eq!(manager.range_position(second_key), RUNG_QUANTITY);
        coin::burn_for_testing(refund);
        transfer::public_transfer(cap, ADMIN);

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };

    test.next_tx(ADMIN);
    {
        let policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        assert!(!policy.settled());
        return_shared(policy);
    };

    end(test);
}

#[test]
fun open_preserves_existing_manager_balance() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        seed_vault(&mut predict, &clock, &mut test);
        manager.deposit<TEST_QUOTE>(
            coin::mint_for_testing<TEST_QUOTE>(EXISTING_MANAGER_BALANCE, test.ctx()),
            test.ctx(),
        );
        let payment = coin::mint_for_testing<TEST_QUOTE>(PREMIUM_AMOUNT, test.ctx());
        let (cap, refund) = range_ladder::open<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            payment,
            BENEFICIARY,
            default_rungs(),
            &clock,
            test.ctx(),
        );

        assert_eq!(manager.balance<TEST_QUOTE>(), EXISTING_MANAGER_BALANCE);
        coin::burn_for_testing(refund);
        transfer::public_transfer(cap, ADMIN);

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun open_aborts_on_empty_ladder() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);

    attempt_open(&mut test, &env, ADMIN, BENEFICIARY, PREMIUM_AMOUNT, vector[]);

    end(test);
}

#[test, expected_failure]
fun open_aborts_on_too_many_rungs() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    let mut rungs = vector[];
    17u64.do!(|_| rungs.push_back(policy::new_rung(LOWER_STRIKE, MID_STRIKE, RUNG_QUANTITY)));

    attempt_open(&mut test, &env, ADMIN, BENEFICIARY, PREMIUM_AMOUNT, rungs);

    end(test);
}

#[test, expected_failure]
fun new_rung_aborts_on_invalid_strike_order() {
    let _rung = policy::new_rung(MID_STRIKE, LOWER_STRIKE, RUNG_QUANTITY);
}

#[test, expected_failure]
fun new_rung_aborts_on_zero_quantity() {
    let _rung = policy::new_rung(LOWER_STRIKE, MID_STRIKE, 0);
}

#[test, expected_failure]
fun open_aborts_on_zero_beneficiary() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);

    attempt_open(&mut test, &env, ADMIN, @0x0, PREMIUM_AMOUNT, default_rungs());

    end(test);
}

#[test, expected_failure]
fun open_aborts_on_zero_premium() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);

    attempt_open(&mut test, &env, ADMIN, BENEFICIARY, 0, default_rungs());

    end(test);
}

#[test, expected_failure]
fun open_aborts_when_oracle_inactive() {
    let mut test = begin(ADMIN);
    let env = setup_inactive(&mut test);

    attempt_open(&mut test, &env, ADMIN, BENEFICIARY, PREMIUM_AMOUNT, default_rungs());

    end(test);
}

#[test, expected_failure]
fun open_aborts_for_non_manager_owner() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);

    attempt_open(&mut test, &env, KEEPER, BENEFICIARY, PREMIUM_AMOUNT, default_rungs());

    end(test);
}

#[test, expected_failure]
fun open_aborts_when_same_range_position_exists() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = first_range_key(&oracle);

        seed_vault(&mut predict, &clock, &mut test);
        predict_manager::deposit<TEST_QUOTE>(
            &mut manager,
            coin::mint_for_testing<TEST_QUOTE>(PREMIUM_AMOUNT, test.ctx()),
            test.ctx(),
        );
        predict::mint_range<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            key,
            RUNG_QUANTITY,
            &clock,
            test.ctx(),
        );

        let payment = coin::mint_for_testing<TEST_QUOTE>(PREMIUM_AMOUNT, test.ctx());
        let (cap, refund) = range_ladder::open<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            payment,
            BENEFICIARY,
            default_rungs(),
            &clock,
            test.ctx(),
        );
        transfer::public_transfer(cap, ADMIN);
        coin::burn_for_testing(refund);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };

    end(test);
}

#[test]
fun set_beneficiary_updates_policy() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let mut policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        let cap = test.take_from_sender<RangeLadderOwnerCap<TEST_QUOTE>>();

        range_ladder::set_beneficiary<TEST_QUOTE>(&mut policy, &cap, KEEPER);

        return_shared(policy);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test, expected_failure]
fun set_beneficiary_aborts_on_zero_beneficiary() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let mut policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        let cap = test.take_from_sender<RangeLadderOwnerCap<TEST_QUOTE>>();

        range_ladder::set_beneficiary<TEST_QUOTE>(&mut policy, &cap, @0x0);

        return_shared(policy);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test]
fun claim_redeems_ranges_withdraws_payout_and_consumes_cap() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env);
    settle_oracle(&mut test, env.oracle_id);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let mut policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        let cap = test.take_from_sender<RangeLadderOwnerCap<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let first_key = first_range_key(&oracle);
        let second_key = second_range_key(&oracle);

        let payout = range_ladder::claim<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &mut policy,
            cap,
            &clock,
            test.ctx(),
        );

        assert_eq!(manager.range_position(first_key), 0);
        assert_eq!(manager.range_position(second_key), 0);
        assert!(policy.settled());
        assert!(payout.value() > 0);
        coin::burn_for_testing(payout);

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(policy);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun claim_aborts_when_oracle_unsettled() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let mut policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        let cap = test.take_from_sender<RangeLadderOwnerCap<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();

        let payout = range_ladder::claim<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &mut policy,
            cap,
            &clock,
            test.ctx(),
        );

        coin::burn_for_testing(payout);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(policy);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun claim_aborts_for_non_manager_owner() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env);
    settle_oracle(&mut test, env.oracle_id);

    test.next_tx(ADMIN);
    {
        let cap = test.take_from_sender<RangeLadderOwnerCap<TEST_QUOTE>>();
        transfer::public_transfer(cap, KEEPER);
    };

    test.next_tx(KEEPER);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let mut policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        let cap = test.take_from_sender<RangeLadderOwnerCap<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();

        let payout = range_ladder::claim<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &mut policy,
            cap,
            &clock,
            test.ctx(),
        );

        coin::burn_for_testing(payout);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(policy);
        return_shared(clock);
    };

    end(test);
}

#[test]
fun settle_redeems_ranges_to_manager() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env);
    settle_oracle(&mut test, env.oracle_id);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let mut policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let first_key = first_range_key(&oracle);
        let second_key = second_range_key(&oracle);

        range_ladder::settle<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &mut policy,
            &clock,
            test.ctx(),
        );

        assert_eq!(manager.range_position(first_key), 0);
        assert_eq!(manager.range_position(second_key), 0);
        assert!(predict_manager::balance<TEST_QUOTE>(&manager) > 0);
        assert!(policy.settled());

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(policy);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun settle_aborts_for_non_manager_owner() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env);
    settle_oracle(&mut test, env.oracle_id);

    test.next_tx(KEEPER);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let mut policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();

        range_ladder::settle<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &mut policy,
            &clock,
            test.ctx(),
        );

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(policy);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun settle_aborts_when_oracle_unsettled() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let mut policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();

        range_ladder::settle<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &mut policy,
            &clock,
            test.ctx(),
        );

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(policy);
        return_shared(clock);
    };

    end(test);
}

#[test]
fun claim_consumes_stale_cap_after_settle() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env);
    settle_oracle(&mut test, env.oracle_id);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let mut policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();

        range_ladder::settle<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &mut policy,
            &clock,
            test.ctx(),
        );

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(policy);
        return_shared(clock);
    };

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let mut policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        let cap = test.take_from_sender<RangeLadderOwnerCap<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();

        let stale_claim = range_ladder::claim<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &mut policy,
            cap,
            &clock,
            test.ctx(),
        );

        assert_eq!(stale_claim.value(), 0);
        coin::burn_for_testing(stale_claim);

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(policy);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun settle_aborts_when_range_position_was_increased() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    open_policy(&mut test, &env);

    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = first_range_key(&oracle);

        predict_manager::deposit<TEST_QUOTE>(
            &mut manager,
            coin::mint_for_testing<TEST_QUOTE>(PREMIUM_AMOUNT, test.ctx()),
            test.ctx(),
        );
        predict::mint_range<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            key,
            1,
            &clock,
            test.ctx(),
        );

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
        let mut policy = test.take_shared<RangeLadderPolicy<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();

        range_ladder::settle<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &mut policy,
            &clock,
            test.ctx(),
        );

        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(policy);
        return_shared(clock);
    };

    end(test);
}

fun default_rungs(): vector<policy::RangeRung> {
    vector[
        policy::new_rung(LOWER_STRIKE, MID_STRIKE, RUNG_QUANTITY),
        policy::new_rung(MID_STRIKE, HIGHER_STRIKE, RUNG_QUANTITY),
    ]
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

fun open_policy(test: &mut Scenario, env: &Env) {
    test.next_tx(ADMIN);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        seed_vault(&mut predict, &clock, test);
        let payment = coin::mint_for_testing<TEST_QUOTE>(PREMIUM_AMOUNT, test.ctx());
        let (cap, refund) = range_ladder::open<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            payment,
            BENEFICIARY,
            default_rungs(),
            &clock,
            test.ctx(),
        );
        transfer::public_transfer(cap, ADMIN);
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
    beneficiary: address,
    premium_amount: u64,
    rungs: vector<policy::RangeRung>,
) {
    test.next_tx(sender);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();

        seed_vault(&mut predict, &clock, test);
        let payment = coin::mint_for_testing<TEST_QUOTE>(premium_amount, test.ctx());
        let (cap, refund) = range_ladder::open<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            payment,
            beneficiary,
            rungs,
            &clock,
            test.ctx(),
        );
        transfer::public_transfer(cap, sender);
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

fun setup_manager(test: &mut Scenario): ID {
    test.next_tx(ADMIN);
    predict::create_manager(test.ctx())
}

fun first_range_key(oracle: &OracleSVI): range_key::RangeKey {
    range_key::new(oracle.id(), oracle.expiry(), LOWER_STRIKE, MID_STRIKE)
}

fun second_range_key(oracle: &OracleSVI): range_key::RangeKey {
    range_key::new(oracle.id(), oracle.expiry(), MID_STRIKE, HIGHER_STRIKE)
}
