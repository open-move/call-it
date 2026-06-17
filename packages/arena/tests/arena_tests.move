#[test_only]
module arena::arena_tests;

use arena::{
    arena::{Self, Arena, ArenaAdminCap, ArenaRoot},
    call_card::{Self, CallCard},
    profile::{Self, CreatorProfile, CreatorProfileCap},
    test_quote::{Self, TEST_QUOTE},
};
use deepbook_predict::{
    i64,
    market_key,
    oracle::{Self, OracleSVI, OracleSVICap},
    plp::PLP,
    predict::{Self, Predict},
    predict_manager::{Self, PredictManager},
    registry::{Self, AdminCap, Registry},
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
const CREATOR: address = @0xB;
const BACKER: address = @0xC;
const FADER: address = @0xD;

const EXPIRY_MS: u64 = 1_000_000;
const SPOT: u64 = 100_000_000_000;
const SETTLEMENT_SPOT: u64 = 120_000_000_000;
const STRIKE: u64 = 110_000_000_000;
const MIN_STRIKE: u64 = 80_000_000_000;
const TICK_SIZE: u64 = 1_000_000;
const MIN_BOND_QUOTE_AMOUNT: u64 = 1_000_000;
const BOND_QUOTE_AMOUNT: u64 = 5_000_000;
const PARTICIPANT_QUOTE_AMOUNT: u64 = 7_000_000;
const PARTICIPANT_QUANTITY: u64 = 100_000;
const SEED_LIQUIDITY: u64 = 10_000_000_000;

public struct Env has drop {
    predict_id: ID,
    oracle_id: ID,
    backer_manager_id: ID,
    fader_manager_id: ID,
}

#[test]
fun bootstrap_creates_root_arena_and_admin_cap() {
    let mut test = begin(ADMIN);
    bootstrap_arena(&mut test);

    test.next_tx(ADMIN);
    {
        let root = test.take_shared<ArenaRoot>();
        let arena = test.take_shared<Arena>();
        let cap = test.take_from_sender<ArenaAdminCap>();

        assert_eq!(arena::min_bond_quote_amount(&arena), MIN_BOND_QUOTE_AMOUNT);
        assert!(arena::root_id(&root).to_address() != @0x0);
        assert!(arena::id(&arena).to_address() != @0x0);
        assert_eq!(arena::id(&arena).to_address(), arena::derived_arena_address(&root));
        assert!(arena::admin_cap_id(&cap).to_address() != @0x0);
        assert_eq!(arena::admin_cap_id(&cap).to_address(), arena::derived_admin_cap_address(&root));

        return_shared(root);
        return_shared(arena);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test]
fun set_config_updates_with_admin_cap() {
    let mut test = begin(ADMIN);
    bootstrap_arena(&mut test);

    test.next_tx(ADMIN);
    {
        let mut arena = test.take_shared<Arena>();
        let cap = test.take_from_sender<ArenaAdminCap>();
        arena::set_config(&mut arena, &cap, MIN_BOND_QUOTE_AMOUNT + 1);

        assert_eq!(arena::min_bond_quote_amount(&arena), MIN_BOND_QUOTE_AMOUNT + 1);

        return_shared(arena);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test]
fun create_profile_succeeds() {
    let mut test = begin(ADMIN);
    bootstrap_arena(&mut test);

    test.next_tx(CREATOR);
    {
        let mut arena = test.take_shared<Arena>();
        let clock = test.take_shared<Clock>();
        let cap = arena::create_profile(&mut arena, b"profile", &clock, test.ctx());

        assert_eq!(arena::total_profiles(&arena), 1);
        transfer::public_transfer(cap, CREATOR);

        return_shared(arena);
        return_shared(clock);
    };

    test.next_tx(CREATOR);
    {
        let profile = test.take_shared<CreatorProfile>();
        let cap = test.take_from_sender<CreatorProfileCap>();

        assert_eq!(profile::creator(&profile), CREATOR);
        assert_eq!(profile::call_count(&profile), 0);
        assert_eq!(profile::settled_count(&profile), 0);
        assert_eq!(profile::win_count(&profile), 0);

        return_shared(profile);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test, expected_failure]
fun create_profile_aborts_on_empty_metadata() {
    let mut test = begin(ADMIN);
    bootstrap_arena(&mut test);

    test.next_tx(CREATOR);
    {
        let mut arena = test.take_shared<Arena>();
        let clock = test.take_shared<Clock>();
        let cap = arena::create_profile(&mut arena, vector[], &clock, test.ctx());
        transfer::public_transfer(cap, CREATOR);
        return_shared(arena);
        return_shared(clock);
    };

    end(test);
}

#[test]
fun launch_call_custodies_plp_bond() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);

    test.next_tx(CREATOR);
    {
        let arena = test.take_shared<Arena>();
        let root = test.take_shared<ArenaRoot>();
        let profile = test.take_shared<CreatorProfile>();
        let call = test.take_shared<CallCard<TEST_QUOTE>>();
        let cap = test.take_from_sender<CreatorProfileCap>();

        assert_eq!(arena::total_calls(&arena), 1);
        assert_eq!(profile::call_count(&profile), 1);
        assert_eq!(call.id().to_address(), arena::derived_call_card_address(&root, 0));
        assert_eq!(call.profile_id(), profile.id());
        assert_eq!(call_card::predict_id(&call), env.predict_id);
        assert_eq!(call.oracle_id(), env.oracle_id);
        assert_eq!(call_card::strike(&call), STRIKE);
        assert!(call_card::is_up(&call));
        assert!(call.bond_plp_amount() > 0);
        assert_eq!(call_card::status(&call), call_card::status_active());

        return_shared(arena);
        return_shared(root);
        return_shared(profile);
        return_shared(call);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test, expected_failure]
fun launch_call_aborts_on_zero_plp_bond() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);

    test.next_tx(CREATOR);
    {
        let mut arena = test.take_shared<Arena>();
        let mut root = test.take_shared<ArenaRoot>();
        let mut profile = test.take_shared<CreatorProfile>();
        let cap = test.take_from_sender<CreatorProfileCap>();
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let bond_payment = coin::zero<TEST_QUOTE>(test.ctx());

        arena::launch_call<TEST_QUOTE>(
            &mut root,
            &mut arena,
            &mut profile,
            &cap,
            &mut predict,
            &oracle,
            bond_payment,
            STRIKE,
            true,
            b"call",
            &clock,
            test.ctx(),
        );

        return_shared(arena);
        return_shared(root);
        return_shared(profile);
        return_shared(predict);
        return_shared(oracle);
        return_shared(clock);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test, expected_failure]
fun launch_call_aborts_on_low_bond_notional() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);

    attempt_launch(&mut test, &env, 1, STRIKE, b"call");

    end(test);
}

#[test, expected_failure]
fun launch_call_aborts_on_empty_metadata() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);

    attempt_launch(&mut test, &env, BOND_QUOTE_AMOUNT, STRIKE, vector[]);

    end(test);
}

#[test, expected_failure]
fun launch_call_aborts_on_off_grid_strike() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);

    attempt_launch(&mut test, &env, BOND_QUOTE_AMOUNT, STRIKE + 1, b"call");

    end(test);
}

#[test]
fun back_and_fade_mint_positions() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);

    test.next_tx(BACKER);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.backer_manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, true);
        let refund = arena::back_call<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &call,
            coin::mint_for_testing<TEST_QUOTE>(PARTICIPANT_QUOTE_AMOUNT, test.ctx()),
            PARTICIPANT_QUANTITY,
            &clock,
            test.ctx(),
        );
        assert_eq!(manager.position(key), PARTICIPANT_QUANTITY);
        coin::burn_for_testing(refund);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(call);
        return_shared(clock);
    };

    test.next_tx(FADER);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.fader_manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let key = market_key::new(env.oracle_id, EXPIRY_MS, STRIKE, false);
        let refund = arena::fade_call<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &call,
            coin::mint_for_testing<TEST_QUOTE>(PARTICIPANT_QUOTE_AMOUNT, test.ctx()),
            PARTICIPANT_QUANTITY,
            &clock,
            test.ctx(),
        );
        assert_eq!(manager.position(key), PARTICIPANT_QUANTITY);
        coin::burn_for_testing(refund);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(call);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun back_call_aborts_after_settlement() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);
    settle_call(&mut test, env.oracle_id);

    test.next_tx(BACKER);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.backer_manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let refund = arena::back_call<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &call,
            coin::mint_for_testing<TEST_QUOTE>(PARTICIPANT_QUOTE_AMOUNT, test.ctx()),
            PARTICIPANT_QUANTITY,
            &clock,
            test.ctx(),
        );
        coin::burn_for_testing(refund);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(call);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun back_call_aborts_on_wrong_oracle() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);
    let wrong_oracle_id = setup_oracle(&mut test, env.predict_id);
    activate_oracle(&mut test, wrong_oracle_id);

    test.next_tx(BACKER);
    {
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let mut manager = test.take_shared_by_id<PredictManager>(env.backer_manager_id);
        let oracle = test.take_shared_by_id<OracleSVI>(wrong_oracle_id);
        let call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let refund = arena::back_call<TEST_QUOTE>(
            &mut predict,
            &mut manager,
            &oracle,
            &call,
            coin::mint_for_testing<TEST_QUOTE>(PARTICIPANT_QUOTE_AMOUNT, test.ctx()),
            PARTICIPANT_QUANTITY,
            &clock,
            test.ctx(),
        );
        coin::burn_for_testing(refund);
        return_shared(predict);
        return_shared(manager);
        return_shared(oracle);
        return_shared(call);
        return_shared(clock);
    };

    end(test);
}

#[test]
fun settle_call_records_win_and_profile_stats() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);
    settle_oracle(&mut test, env.oracle_id);

    test.next_tx(BACKER);
    {
        let mut arena = test.take_shared<Arena>();
        let mut profile = test.take_shared<CreatorProfile>();
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let mut call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();

        arena::settle_call<TEST_QUOTE>(&mut arena, &mut profile, &oracle, &mut call, &clock);

        assert_eq!(arena::total_settled_calls(&arena), 1);
        assert_eq!(profile::settled_count(&profile), 1);
        assert_eq!(profile::win_count(&profile), 1);
        assert!(call_card::settled(&call));
        assert_eq!(call_card::status(&call), call_card::status_settled());

        return_shared(arena);
        return_shared(profile);
        return_shared(oracle);
        return_shared(call);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun settle_call_aborts_before_oracle_settlement() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);

    test.next_tx(BACKER);
    {
        let mut arena = test.take_shared<Arena>();
        let mut profile = test.take_shared<CreatorProfile>();
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let mut call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();

        arena::settle_call<TEST_QUOTE>(&mut arena, &mut profile, &oracle, &mut call, &clock);

        return_shared(arena);
        return_shared(profile);
        return_shared(oracle);
        return_shared(call);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun double_settle_aborts() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);
    settle_call(&mut test, env.oracle_id);

    test.next_tx(BACKER);
    {
        let mut arena = test.take_shared<Arena>();
        let mut profile = test.take_shared<CreatorProfile>();
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let mut call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        arena::settle_call<TEST_QUOTE>(&mut arena, &mut profile, &oracle, &mut call, &clock);
        return_shared(arena);
        return_shared(profile);
        return_shared(oracle);
        return_shared(call);
        return_shared(clock);
    };

    end(test);
}

#[test, expected_failure]
fun claim_bond_aborts_before_settlement() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);

    test.next_tx(CREATOR);
    {
        let profile = test.take_shared<CreatorProfile>();
        let cap = test.take_from_sender<CreatorProfileCap>();
        let mut call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let bond = arena::claim_bond<TEST_QUOTE>(&profile, &cap, &mut call, &clock, test.ctx());
        coin::burn_for_testing(bond);
        return_shared(profile);
        return_shared(call);
        return_shared(clock);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test, expected_failure]
fun claim_bond_aborts_for_wrong_creator() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);
    settle_call(&mut test, env.oracle_id);

    test.next_tx(CREATOR);
    {
        let cap = test.take_from_sender<CreatorProfileCap>();
        transfer::public_transfer(cap, BACKER);
    };

    test.next_tx(BACKER);
    {
        let profile = test.take_shared<CreatorProfile>();
        let cap = test.take_from_sender<CreatorProfileCap>();
        let mut call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let bond = arena::claim_bond<TEST_QUOTE>(&profile, &cap, &mut call, &clock, test.ctx());
        coin::burn_for_testing(bond);
        return_shared(profile);
        return_shared(call);
        return_shared(clock);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test, expected_failure]
fun claim_bond_aborts_for_wrong_profile() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);
    settle_call(&mut test, env.oracle_id);
    let wrong_profile_id = create_profile_for(&mut test, BACKER, b"wrong-profile");

    test.next_tx(BACKER);
    {
        let profile = test.take_shared_by_id<CreatorProfile>(wrong_profile_id);
        let cap = test.take_from_sender<CreatorProfileCap>();
        let mut call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let bond = arena::claim_bond<TEST_QUOTE>(&profile, &cap, &mut call, &clock, test.ctx());
        coin::burn_for_testing(bond);
        return_shared(profile);
        return_shared(call);
        return_shared(clock);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test]
fun claim_bond_returns_same_plp_shares() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);
    settle_call(&mut test, env.oracle_id);

    test.next_tx(CREATOR);
    {
        let profile = test.take_shared<CreatorProfile>();
        let cap = test.take_from_sender<CreatorProfileCap>();
        let mut call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let expected_bond = call.bond_plp_amount();
        let bond = arena::claim_bond<TEST_QUOTE>(&profile, &cap, &mut call, &clock, test.ctx());

        assert_eq!(bond.value(), expected_bond);
        assert_eq!(call.bond_plp_amount(), 0);
        assert_eq!(call_card::status(&call), call_card::status_bond_claimed());
        coin::burn_for_testing(bond);

        return_shared(profile);
        return_shared(call);
        return_shared(clock);
        test.return_to_sender(cap);
    };

    end(test);
}

#[test, expected_failure]
fun double_bond_claim_aborts() {
    let mut test = begin(ADMIN);
    let env = setup(&mut test);
    create_profile(&mut test);
    launch_call(&mut test, &env);
    settle_call(&mut test, env.oracle_id);

    test.next_tx(CREATOR);
    {
        let profile = test.take_shared<CreatorProfile>();
        let cap = test.take_from_sender<CreatorProfileCap>();
        let mut call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let bond = arena::claim_bond<TEST_QUOTE>(&profile, &cap, &mut call, &clock, test.ctx());
        coin::burn_for_testing(bond);
        return_shared(profile);
        return_shared(call);
        return_shared(clock);
        test.return_to_sender(cap);
    };

    test.next_tx(CREATOR);
    {
        let profile = test.take_shared<CreatorProfile>();
        let cap = test.take_from_sender<CreatorProfileCap>();
        let mut call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        let bond = arena::claim_bond<TEST_QUOTE>(&profile, &cap, &mut call, &clock, test.ctx());
        coin::burn_for_testing(bond);
        return_shared(profile);
        return_shared(call);
        return_shared(clock);
        test.return_to_sender(cap);
    };

    end(test);
}

fun bootstrap_arena(test: &mut Scenario) {
    setup_clock(test);
    test.next_tx(ADMIN);
    {
        let cap = arena::bootstrap(
            arena::publisher_for_testing(test.ctx()),
            MIN_BOND_QUOTE_AMOUNT,
            test.ctx(),
        );
        transfer::public_transfer(cap, ADMIN);
    }
}

fun create_profile(test: &mut Scenario) {
    bootstrap_arena(test);
    test.next_tx(CREATOR);
    {
        let mut arena = test.take_shared<Arena>();
        let clock = test.take_shared<Clock>();
        let cap = arena::create_profile(&mut arena, b"profile", &clock, test.ctx());
        transfer::public_transfer(cap, CREATOR);
        return_shared(arena);
        return_shared(clock);
    }
}

fun launch_call(test: &mut Scenario, env: &Env) {
    attempt_launch(
        test,
        env,
        BOND_QUOTE_AMOUNT,
        STRIKE,
        b"call",
    )
}

fun create_profile_for(test: &mut Scenario, creator: address, metadata_hash: vector<u8>): ID {
    test.next_tx(creator);
    let mut arena = test.take_shared<Arena>();
    let clock = test.take_shared<Clock>();
    let cap = arena::create_profile(&mut arena, metadata_hash, &clock, test.ctx());
    let profile_id = profile::cap_profile_id(&cap);
    transfer::public_transfer(cap, creator);
    return_shared(arena);
    return_shared(clock);
    profile_id
}

fun attempt_launch(
    test: &mut Scenario,
    env: &Env,
    bond_quote_amount: u64,
    strike: u64,
    metadata_hash: vector<u8>,
) {
    test.next_tx(CREATOR);
    {
        let mut arena = test.take_shared<Arena>();
        let mut root = test.take_shared<ArenaRoot>();
        let mut profile = test.take_shared<CreatorProfile>();
        let cap = test.take_from_sender<CreatorProfileCap>();
        let mut predict = test.take_shared_by_id<Predict>(env.predict_id);
        let oracle = test.take_shared_by_id<OracleSVI>(env.oracle_id);
        let clock = test.take_shared<Clock>();
        let bond_payment = coin::mint_for_testing<TEST_QUOTE>(bond_quote_amount, test.ctx());

        arena::launch_call<TEST_QUOTE>(
            &mut root,
            &mut arena,
            &mut profile,
            &cap,
            &mut predict,
            &oracle,
            bond_payment,
            strike,
            true,
            metadata_hash,
            &clock,
            test.ctx(),
        );

        return_shared(arena);
        return_shared(root);
        return_shared(profile);
        return_shared(predict);
        return_shared(oracle);
        return_shared(clock);
        test.return_to_sender(cap);
    }
}

fun settle_call(test: &mut Scenario, oracle_id: ID) {
    settle_oracle(test, oracle_id);
    test.next_tx(BACKER);
    {
        let mut arena = test.take_shared<Arena>();
        let mut profile = test.take_shared<CreatorProfile>();
        let oracle = test.take_shared_by_id<OracleSVI>(oracle_id);
        let mut call = test.take_shared<CallCard<TEST_QUOTE>>();
        let clock = test.take_shared<Clock>();
        arena::settle_call<TEST_QUOTE>(&mut arena, &mut profile, &oracle, &mut call, &clock);
        return_shared(arena);
        return_shared(profile);
        return_shared(oracle);
        return_shared(call);
        return_shared(clock);
    }
}

fun setup(test: &mut Scenario): Env {
    setup_clock(test);
    let currency = test_quote::create_currency(test.ctx());

    registry::init_for_testing(test.ctx());

    test.next_tx(ADMIN);
    let predict_id = setup_predict(test, &currency);
    destroy(currency);
    seed_vault(test, predict_id);

    let oracle_id = setup_oracle(test, predict_id);
    activate_oracle(test, oracle_id);
    let backer_manager_id = setup_manager(test, BACKER);
    let fader_manager_id = setup_manager(test, FADER);

    Env { predict_id, oracle_id, backer_manager_id, fader_manager_id }
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

fun setup_manager(test: &mut Scenario, owner: address): ID {
    test.next_tx(owner);
    predict::create_manager(test.ctx())
}
