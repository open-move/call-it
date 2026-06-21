#[test_only]
module keeper_rewards::reward_vault_tests;

use keeper_rewards::reward_vault::{Self, RewardVault, RewardVaultAdminCap};
use keeper_rewards::test_quote::{Self, TEST_QUOTE};

use deepbook_predict::{
    i64,
    market_key,
    oracle::{Self, OracleSVI, OracleSVICap},
    plp::PLP,
    predict::{Self, Predict},
    predict_manager::PredictManager,
    registry::{Self, AdminCap, Registry},
};

use std::unit_test::{assert_eq, destroy};
use sui::{
    clock::{Self, Clock},
    coin::{Self},
    coin_registry::Currency,
    test_scenario::{begin, end, return_shared, Scenario},
};

const ADMIN: address = @0xA;
const KEEPER: address = @0xB;

const EXPIRY_MS: u64 = 1_000_000;
const SPOT: u64 = 100_000_000_000;
const STRIKE: u64 = 90_000_000_000;
const TICK_SIZE: u64 = 10_000;
const SEED_LIQUIDITY: u64 = 1_000_000_000_000_000;
const QUANTITY: u64 = 1_000_000;

const REWARD_AMOUNT: u64 = 1_000;
const MIN_PAYOUT: u64 = 1;
const VAULT_FUNDING: u64 = 1_000_000;

// Mirror of reward_vault error codes for expected_failure assertions.
const EWrongAdminCap: u64 = 0;
const EPaused: u64 = 1;
const EWrongPredict: u64 = 2;
const EManagerNotAllowed: u64 = 3;
const EOracleNotSettled: u64 = 4;
const ENoPosition: u64 = 5;
const EPayoutBelowMin: u64 = 6;
const EInsufficientRewards: u64 = 7;

public struct Env has drop {
    predict_id: ID,
    oracle_id: ID,
    manager_id: ID,
}

// === Admin / policy tests ===

#[test]
fun create_vault_sets_predict_and_policy() {
    let mut test = begin(ADMIN);
    let predict_id = setup_predict_only(&mut test);

    test.next_tx(ADMIN);
    let predict = test.take_shared_by_id<Predict>(predict_id);
    let (vault, cap) = reward_vault::create_vault<TEST_QUOTE>(&predict, REWARD_AMOUNT, MIN_PAYOUT, test.ctx());

    assert_eq!(reward_vault::predict_id(&vault), predict_id);
    assert_eq!(reward_vault::reward_amount(&vault), REWARD_AMOUNT);
    assert_eq!(reward_vault::min_payout(&vault), MIN_PAYOUT);
    assert_eq!(reward_vault::rewards_value(&vault), 0);
    assert!(!reward_vault::paused(&vault));
    assert_eq!(reward_vault::cap_vault_id(&cap), reward_vault::id(&vault));

    return_shared(predict);
    destroy(vault);
    destroy(cap);
    end(test);
}

#[test]
fun fund_increases_reward_balance() {
    let mut test = begin(ADMIN);
    let predict_id = setup_predict_only(&mut test);

    test.next_tx(ADMIN);
    let predict = test.take_shared_by_id<Predict>(predict_id);
    let (mut vault, cap) = reward_vault::create_vault<TEST_QUOTE>(&predict, REWARD_AMOUNT, MIN_PAYOUT, test.ctx());

    reward_vault::fund(&mut vault, coin::mint_for_testing<TEST_QUOTE>(500, test.ctx()), test.ctx());
    reward_vault::fund(&mut vault, coin::mint_for_testing<TEST_QUOTE>(250, test.ctx()), test.ctx());
    assert_eq!(reward_vault::rewards_value(&vault), 750);

    return_shared(predict);
    destroy(vault);
    destroy(cap);
    end(test);
}

#[test]
fun admin_can_withdraw_rewards() {
    let mut test = begin(ADMIN);
    let predict_id = setup_predict_only(&mut test);

    test.next_tx(ADMIN);
    let predict = test.take_shared_by_id<Predict>(predict_id);
    let (mut vault, cap) = reward_vault::create_vault<TEST_QUOTE>(&predict, REWARD_AMOUNT, MIN_PAYOUT, test.ctx());

    reward_vault::fund(&mut vault, coin::mint_for_testing<TEST_QUOTE>(500, test.ctx()), test.ctx());
    let out = reward_vault::withdraw(&mut vault, &cap, 200, test.ctx());

    assert_eq!(out.value(), 200);
    assert_eq!(reward_vault::rewards_value(&vault), 300);

    destroy(out);
    return_shared(predict);
    destroy(vault);
    destroy(cap);
    end(test);
}

#[test]
fun set_policy_updates_values() {
    let mut test = begin(ADMIN);
    let predict_id = setup_predict_only(&mut test);

    test.next_tx(ADMIN);
    let predict = test.take_shared_by_id<Predict>(predict_id);
    let (mut vault, cap) = reward_vault::create_vault<TEST_QUOTE>(&predict, REWARD_AMOUNT, MIN_PAYOUT, test.ctx());

    reward_vault::set_policy(&mut vault, &cap, 42, 7);
    assert_eq!(reward_vault::reward_amount(&vault), 42);
    assert_eq!(reward_vault::min_payout(&vault), 7);

    return_shared(predict);
    destroy(vault);
    destroy(cap);
    end(test);
}

#[test]
fun set_paused_toggles_state() {
    let mut test = begin(ADMIN);
    let predict_id = setup_predict_only(&mut test);

    test.next_tx(ADMIN);
    let predict = test.take_shared_by_id<Predict>(predict_id);
    let (mut vault, cap) = reward_vault::create_vault<TEST_QUOTE>(&predict, REWARD_AMOUNT, MIN_PAYOUT, test.ctx());

    reward_vault::set_paused(&mut vault, &cap, true);
    assert!(reward_vault::paused(&vault));
    reward_vault::set_paused(&mut vault, &cap, false);
    assert!(!reward_vault::paused(&vault));

    return_shared(predict);
    destroy(vault);
    destroy(cap);
    end(test);
}

#[test]
fun allow_and_disallow_manager() {
    let mut test = begin(ADMIN);
    let predict_id = setup_predict_only(&mut test);
    let manager_id = setup_manager(&mut test, ADMIN);

    test.next_tx(ADMIN);
    let predict = test.take_shared_by_id<Predict>(predict_id);
    let manager = test.take_shared_by_id<PredictManager>(manager_id);
    let (mut vault, cap) = reward_vault::create_vault<TEST_QUOTE>(&predict, REWARD_AMOUNT, MIN_PAYOUT, test.ctx());

    assert!(!reward_vault::is_manager_allowed(&vault, manager_id));
    reward_vault::allow_manager(&mut vault, &cap, &manager);
    assert!(reward_vault::is_manager_allowed(&vault, manager_id));
    // idempotent
    reward_vault::allow_manager(&mut vault, &cap, &manager);
    assert!(reward_vault::is_manager_allowed(&vault, manager_id));
    reward_vault::disallow_manager(&mut vault, &cap, manager_id);
    assert!(!reward_vault::is_manager_allowed(&vault, manager_id));

    return_shared(predict);
    return_shared(manager);
    destroy(vault);
    destroy(cap);
    end(test);
}

#[test, expected_failure(abort_code = EWrongAdminCap, location = reward_vault)]
fun wrong_cap_cannot_withdraw() {
    let mut test = begin(ADMIN);
    let predict_id = setup_predict_only(&mut test);

    test.next_tx(ADMIN);
    let predict = test.take_shared_by_id<Predict>(predict_id);
    let (mut vault_a, _cap_a) = reward_vault::create_vault<TEST_QUOTE>(&predict, REWARD_AMOUNT, MIN_PAYOUT, test.ctx());
    let (_vault_b, cap_b) = reward_vault::create_vault<TEST_QUOTE>(&predict, REWARD_AMOUNT, MIN_PAYOUT, test.ctx());

    let stolen = reward_vault::withdraw(&mut vault_a, &cap_b, 0, test.ctx());
    destroy(stolen);
    abort
}

#[test, expected_failure(abort_code = EWrongAdminCap, location = reward_vault)]
fun wrong_cap_cannot_set_policy() {
    let mut test = begin(ADMIN);
    let predict_id = setup_predict_only(&mut test);

    test.next_tx(ADMIN);
    let predict = test.take_shared_by_id<Predict>(predict_id);
    let (mut vault_a, _cap_a) = reward_vault::create_vault<TEST_QUOTE>(&predict, REWARD_AMOUNT, MIN_PAYOUT, test.ctx());
    let (_vault_b, cap_b) = reward_vault::create_vault<TEST_QUOTE>(&predict, REWARD_AMOUNT, MIN_PAYOUT, test.ctx());

    reward_vault::set_policy(&mut vault_a, &cap_b, 1, 1);
    abort
}

// === Redemption tests ===

#[test]
fun redeem_with_reward_pays_for_winning_position() {
    let mut test = begin(ADMIN);
    let env = setup_env(&mut test);
    mint_down(&mut test, &env, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);
    let vault_id = create_and_share_vault(&mut test, env.predict_id);
    fund_vault(&mut test, vault_id, VAULT_FUNDING);
    allow_manager_on_vault(&mut test, vault_id, env.manager_id);

    test.next_tx(KEEPER);
    {
        let mut vault = test.take_shared_by_id<RewardVault<TEST_QUOTE>>(vault_id);
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, false);

        let reward = reward_vault::redeem_with_reward<TEST_QUOTE, TEST_QUOTE>(
            &mut vault,
            &mut predict,
            &mut manager,
            &oracle,
            key,
            &clock,
            test.ctx(),
        );

        assert_eq!(reward.value(), REWARD_AMOUNT);
        assert_eq!(manager.position(key), 0);
        assert_eq!(reward_vault::rewards_value(&vault), VAULT_FUNDING - REWARD_AMOUNT);
        // settled winning payout was deposited into the manager
        assert!(manager.balance<TEST_QUOTE>() > 0);

        transfer::public_transfer(reward, KEEPER);
        return_shared(vault);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure(abort_code = EPayoutBelowMin, location = reward_vault)]
fun redeem_aborts_for_losing_position() {
    let mut test = begin(ADMIN);
    let env = setup_env(&mut test);
    mint_down(&mut test, &env, QUANTITY);
    // settle above strike: DOWN loses, settled payout is zero
    settle_oracle(&mut test, env.oracle_id, SPOT);
    let vault_id = create_and_share_vault(&mut test, env.predict_id);
    fund_vault(&mut test, vault_id, VAULT_FUNDING);
    allow_manager_on_vault(&mut test, vault_id, env.manager_id);

    redeem_expecting_abort(&mut test, &env, vault_id);
    abort
}

#[test, expected_failure(abort_code = EManagerNotAllowed, location = reward_vault)]
fun redeem_aborts_for_disallowed_manager() {
    let mut test = begin(ADMIN);
    let env = setup_env(&mut test);
    mint_down(&mut test, &env, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);
    let vault_id = create_and_share_vault(&mut test, env.predict_id);
    fund_vault(&mut test, vault_id, VAULT_FUNDING);

    redeem_expecting_abort(&mut test, &env, vault_id);
    abort
}

#[test, expected_failure(abort_code = EOracleNotSettled, location = reward_vault)]
fun redeem_aborts_when_oracle_not_settled() {
    let mut test = begin(ADMIN);
    let env = setup_env(&mut test);
    mint_down(&mut test, &env, QUANTITY);
    let vault_id = create_and_share_vault(&mut test, env.predict_id);
    fund_vault(&mut test, vault_id, VAULT_FUNDING);
    allow_manager_on_vault(&mut test, vault_id, env.manager_id);

    redeem_expecting_abort(&mut test, &env, vault_id);
    abort
}

#[test, expected_failure(abort_code = ENoPosition, location = reward_vault)]
fun redeem_aborts_when_no_position() {
    let mut test = begin(ADMIN);
    let env = setup_env(&mut test);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);
    let vault_id = create_and_share_vault(&mut test, env.predict_id);
    fund_vault(&mut test, vault_id, VAULT_FUNDING);
    allow_manager_on_vault(&mut test, vault_id, env.manager_id);

    redeem_expecting_abort(&mut test, &env, vault_id);
    abort
}

#[test, expected_failure(abort_code = EInsufficientRewards, location = reward_vault)]
fun redeem_aborts_when_rewards_insufficient() {
    let mut test = begin(ADMIN);
    let env = setup_env(&mut test);
    mint_down(&mut test, &env, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);
    let vault_id = create_and_share_vault(&mut test, env.predict_id);
    // intentionally NOT funded
    allow_manager_on_vault(&mut test, vault_id, env.manager_id);

    redeem_expecting_abort(&mut test, &env, vault_id);
    abort
}

#[test, expected_failure(abort_code = EPaused, location = reward_vault)]
fun redeem_aborts_when_paused() {
    let mut test = begin(ADMIN);
    let env = setup_env(&mut test);
    mint_down(&mut test, &env, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);
    let vault_id = create_and_share_vault(&mut test, env.predict_id);
    fund_vault(&mut test, vault_id, VAULT_FUNDING);
    allow_manager_on_vault(&mut test, vault_id, env.manager_id);
    pause_vault(&mut test, vault_id);

    redeem_expecting_abort(&mut test, &env, vault_id);
    abort
}

#[test, expected_failure(abort_code = EWrongPredict, location = reward_vault)]
fun redeem_aborts_for_wrong_predict() {
    let mut test = begin(ADMIN);
    let env = setup_env(&mut test);
    mint_down(&mut test, &env, QUANTITY);
    settle_oracle(&mut test, env.oracle_id, STRIKE - 1);

    // Bind the vault to a different Predict object.
    let other_predict_id = add_predict(&mut test);
    let vault_id = create_and_share_vault(&mut test, other_predict_id);
    fund_vault(&mut test, vault_id, VAULT_FUNDING);
    allow_manager_on_vault(&mut test, vault_id, env.manager_id);

    // Redeem against env.predict_id, which is not the vault's bound Predict.
    redeem_expecting_abort(&mut test, &env, vault_id);
    abort
}

// === Helpers ===

fun redeem_expecting_abort(test: &mut Scenario, env: &Env, vault_id: ID) {
    test.next_tx(KEEPER);
    let mut vault = test.take_shared_by_id<RewardVault<TEST_QUOTE>>(vault_id);
    let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
    let mut manager = test.take_shared_by_id<PredictManager>(env.manager_id);
    let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
    let clock = test.take_shared<Clock>();
    let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, false);

    let reward = reward_vault::redeem_with_reward<TEST_QUOTE, TEST_QUOTE>(
        &mut vault,
        &mut predict,
        &mut manager,
        &oracle,
        key,
        &clock,
        test.ctx(),
    );
    // Dead code at runtime (the call above aborts in the failure tests), but the
    // compiler needs the taken shared objects consumed on the normal path.
    destroy(reward);
    return_shared(vault);
    return_shared(predict);
    return_shared(manager);
    return_shared(oracle);
    return_shared(clock);
}

fun setup_env(test: &mut Scenario): Env {
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

    Env { predict_id, oracle_id, manager_id }
}

fun setup_predict_only(test: &mut Scenario): ID {
    setup_clock(test);
    let currency = test_quote::create_currency(test.ctx());
    registry::init_for_testing(test.ctx());

    test.next_tx(ADMIN);
    let predict_id = setup_predict(test, &currency);
    destroy(currency);
    predict_id
}

// Stand up an independent Predict in its own registry (a Predict registry only
// permits one Predict, so the "wrong predict" test needs a second registry).
fun add_predict(test: &mut Scenario): ID {
    test.next_tx(ADMIN);
    let registry_id = registry::init_for_testing(test.ctx());

    test.next_tx(ADMIN);
    let currency = test_quote::create_currency(test.ctx());
    let mut registry = test.take_shared_by_id<Registry>(registry_id);
    let admin_cap = registry::create_admin_cap_for_testing(test.ctx());
    let clock = test.take_shared<Clock>();
    let treasury_cap = coin::create_treasury_cap_for_testing<PLP>(test.ctx());
    let predict_id = registry::create_predict<TEST_QUOTE>(
        &mut registry,
        &admin_cap,
        &currency,
        treasury_cap,
        &clock,
        test.ctx(),
    );
    destroy(currency);
    destroy(admin_cap);
    return_shared(registry);
    return_shared(clock);
    predict_id
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
        oracle::new_svi_params(100_000_000, 100_000_000, i64::zero(), i64::zero(), 100_000_000),
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

fun mint_down(test: &mut Scenario, env: &Env, quantity: u64) {
    test.next_tx(ADMIN);
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

fun create_and_share_vault(test: &mut Scenario, predict_id: ID): ID {
    test.next_tx(ADMIN);
    let predict = test.take_shared_by_id<Predict>(predict_id);
    let (vault, cap) = reward_vault::create_vault<TEST_QUOTE>(&predict, REWARD_AMOUNT, MIN_PAYOUT, test.ctx());
    let vault_id = reward_vault::id(&vault);
    reward_vault::share_vault(vault);
    transfer::public_transfer(cap, ADMIN);
    return_shared(predict);
    vault_id
}

fun fund_vault(test: &mut Scenario, vault_id: ID, amount: u64) {
    test.next_tx(ADMIN);
    let mut vault = test.take_shared_by_id<RewardVault<TEST_QUOTE>>(vault_id);
    reward_vault::fund(&mut vault, coin::mint_for_testing<TEST_QUOTE>(amount, test.ctx()), test.ctx());
    return_shared(vault);
}

fun allow_manager_on_vault(test: &mut Scenario, vault_id: ID, manager_id: ID) {
    test.next_tx(ADMIN);
    let mut vault = test.take_shared_by_id<RewardVault<TEST_QUOTE>>(vault_id);
    let cap = test.take_from_sender<RewardVaultAdminCap>();
    let manager = test.take_shared_by_id<PredictManager>(manager_id);
    reward_vault::allow_manager(&mut vault, &cap, &manager);
    return_shared(vault);
    return_shared(manager);
    test.return_to_sender(cap);
}

fun pause_vault(test: &mut Scenario, vault_id: ID) {
    test.next_tx(ADMIN);
    let mut vault = test.take_shared_by_id<RewardVault<TEST_QUOTE>>(vault_id);
    let cap = test.take_from_sender<RewardVaultAdminCap>();
    reward_vault::set_paused(&mut vault, &cap, true);
    return_shared(vault);
    test.return_to_sender(cap);
}
