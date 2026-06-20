#[test_only]
module base_vault::base_vault_tests;

use base_vault::{
    base_vault::{Self, BASE_VAULT, BaseVault},
    test_quote::{Self, TEST_QUOTE},
};
use std::unit_test::{assert_eq, destroy};
use sui::{
    coin::{Self, Coin},
    test_scenario::{begin, end, return_shared, Scenario},
    transfer,
};

const ADMIN: address = @0xA;
const USER: address = @0xB;
const OTHER: address = @0xC;

const DEPOSIT_AMOUNT: u64 = 10_000_000_000;
const SECOND_DEPOSIT_AMOUNT: u64 = 20_000_000_000;

#[test]
fun create_vault_sets_cap_and_zero_state() {
    let mut test = begin(ADMIN);
    let treasury = coin::create_treasury_cap_for_testing<BASE_VAULT>(test.ctx());
    let (vault, cap) = base_vault::create_vault<TEST_QUOTE>(treasury, test.ctx());
    let vault_id = vault.id();

    assert_eq!(vault.nav(), 0);
    assert_eq!(vault.cash_value(), 0);
    assert_eq!(vault.share_supply(), 0);
    assert!(!vault.paused());
    assert_eq!(base_vault::cap_vault_id(&cap), vault_id);

    base_vault::share_vault(vault);
    base_vault::destroy_cap_for_testing(cap);
    end(test);
}

#[test]
fun first_deposit_mints_one_to_one_base_shares() {
    let mut test = begin(ADMIN);
    let vault_id = setup_vault(&mut test);

    deposit_as(&mut test, vault_id, USER, DEPOSIT_AMOUNT);

    test.next_tx(USER);
    {
        let vault = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(vault_id);
        let shares = test.take_from_sender<Coin<BASE_VAULT>>();

        assert_eq!(shares.value(), DEPOSIT_AMOUNT);
        assert_eq!(vault.cash_value(), DEPOSIT_AMOUNT);
        assert_eq!(vault.nav(), DEPOSIT_AMOUNT);
        assert_eq!(vault.share_supply(), DEPOSIT_AMOUNT);
        assert_eq!(vault.value_for_shares(shares.value()), DEPOSIT_AMOUNT);

        transfer::public_transfer(shares, USER);
        return_shared(vault);
    };

    end(test);
}

#[test]
fun multiple_deposits_mint_proportional_shares() {
    let mut test = begin(ADMIN);
    let vault_id = setup_vault(&mut test);

    deposit_as(&mut test, vault_id, USER, DEPOSIT_AMOUNT);
    deposit_as(&mut test, vault_id, OTHER, SECOND_DEPOSIT_AMOUNT);

    test.next_tx(ADMIN);
    {
        let vault = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(vault_id);
        assert_eq!(vault.cash_value(), DEPOSIT_AMOUNT + SECOND_DEPOSIT_AMOUNT);
        assert_eq!(vault.nav(), DEPOSIT_AMOUNT + SECOND_DEPOSIT_AMOUNT);
        assert_eq!(vault.share_supply(), DEPOSIT_AMOUNT + SECOND_DEPOSIT_AMOUNT);
        return_shared(vault);
    };

    end(test);
}

#[test]
fun partial_withdraw_burns_shares_and_returns_pro_rata_cash() {
    let mut test = begin(ADMIN);
    let vault_id = setup_vault(&mut test);
    deposit_as(&mut test, vault_id, USER, DEPOSIT_AMOUNT);

    test.next_tx(USER);
    {
        let mut vault = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(vault_id);
        let mut shares = test.take_from_sender<Coin<BASE_VAULT>>();
        let split = shares.split(DEPOSIT_AMOUNT / 2, test.ctx());
        let out = base_vault::withdraw(&mut vault, split, test.ctx());

        assert_eq!(out.value(), DEPOSIT_AMOUNT / 2);
        assert_eq!(vault.cash_value(), DEPOSIT_AMOUNT / 2);
        assert_eq!(vault.share_supply(), DEPOSIT_AMOUNT / 2);

        transfer::public_transfer(out, USER);
        transfer::public_transfer(shares, USER);
        return_shared(vault);
    };

    end(test);
}

#[test]
fun full_withdraw_returns_vault_to_zero() {
    let mut test = begin(ADMIN);
    let vault_id = setup_vault(&mut test);
    deposit_as(&mut test, vault_id, USER, DEPOSIT_AMOUNT);

    test.next_tx(USER);
    {
        let mut vault = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(vault_id);
        let shares = test.take_from_sender<Coin<BASE_VAULT>>();
        let out = base_vault::withdraw(&mut vault, shares, test.ctx());

        assert_eq!(out.value(), DEPOSIT_AMOUNT);
        assert_eq!(vault.cash_value(), 0);
        assert_eq!(vault.nav(), 0);
        assert_eq!(vault.share_supply(), 0);

        transfer::public_transfer(out, USER);
        return_shared(vault);
    };

    end(test);
}

#[test, expected_failure(abort_code = 3)]
fun zero_deposit_aborts() {
    let mut test = begin(ADMIN);
    let vault_id = setup_vault(&mut test);

    test.next_tx(USER);
    {
        let mut vault = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(vault_id);
        let shares = base_vault::deposit(&mut vault, coin::zero<TEST_QUOTE>(test.ctx()), test.ctx());
        transfer::public_transfer(shares, USER);
        return_shared(vault);
    };

    abort
}

#[test, expected_failure(abort_code = 4)]
fun zero_share_withdraw_aborts() {
    let mut test = begin(ADMIN);
    let vault_id = setup_vault(&mut test);

    test.next_tx(USER);
    {
        let mut vault = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(vault_id);
        let out = base_vault::withdraw(&mut vault, coin::zero<BASE_VAULT>(test.ctx()), test.ctx());
        transfer::public_transfer(out, USER);
        return_shared(vault);
    };

    abort
}

#[test, expected_failure(abort_code = 4)]
fun dust_deposit_that_mints_zero_shares_aborts() {
    let mut test = begin(ADMIN);
    let vault_id = setup_vault(&mut test);
    deposit_as(&mut test, vault_id, USER, 1);

    test.next_tx(ADMIN);
    {
        let mut vault = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(vault_id);
        base_vault::add_cash_for_testing(&mut vault, coin::mint_for_testing<TEST_QUOTE>(10, test.ctx()));
        return_shared(vault);
    };

    deposit_as(&mut test, vault_id, OTHER, 1);

    abort
}

#[test, expected_failure(abort_code = 1)]
fun paused_blocks_deposit() {
    let mut test = begin(ADMIN);
    let vault_id = setup_vault(&mut test);
    pause(&mut test, vault_id, true);

    deposit_as(&mut test, vault_id, USER, DEPOSIT_AMOUNT);

    abort
}

#[test, expected_failure(abort_code = 1)]
fun paused_blocks_withdraw() {
    let mut test = begin(ADMIN);
    let vault_id = setup_vault(&mut test);
    deposit_as(&mut test, vault_id, USER, DEPOSIT_AMOUNT);
    pause(&mut test, vault_id, true);

    test.next_tx(USER);
    {
        let mut vault = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(vault_id);
        let shares = test.take_from_sender<Coin<BASE_VAULT>>();
        let out = base_vault::withdraw(&mut vault, shares, test.ctx());
        transfer::public_transfer(out, USER);
        return_shared(vault);
    };

    abort
}

#[test]
fun large_nav_math_uses_u128_intermediates() {
    let nav = 18_000_000_000_000_000_000;
    let supply = 9_000_000_000_000_000_000;
    let amount = 2_000_000_000_000_000_000;
    let shares = 1_000_000_000_000_000_000;

    assert_eq!(base_vault::shares_for_deposit(nav, supply, amount), shares);
    assert_eq!(base_vault::amount_for_shares(nav, supply, shares), amount);
}

fun setup_vault(test: &mut Scenario): sui::object::ID {
    let currency = test_quote::create_currency(test.ctx());
    destroy(currency);

    test.next_tx(ADMIN);
    let treasury = coin::create_treasury_cap_for_testing<BASE_VAULT>(test.ctx());
    let (vault, cap) = base_vault::create_vault<TEST_QUOTE>(treasury, test.ctx());
    let vault_id = vault.id();
    base_vault::share_vault(vault);
    transfer::public_transfer(cap, ADMIN);
    vault_id
}

fun deposit_as(test: &mut Scenario, vault_id: sui::object::ID, user: address, amount: u64) {
    test.next_tx(user);
    {
        let mut vault = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(vault_id);
        let funds = coin::mint_for_testing<TEST_QUOTE>(amount, test.ctx());
        let shares = base_vault::deposit(&mut vault, funds, test.ctx());

        transfer::public_transfer(shares, user);
        return_shared(vault);
    }
}

fun pause(test: &mut Scenario, vault_id: sui::object::ID, paused: bool) {
    test.next_tx(ADMIN);
    {
        let mut vault = test.take_shared_by_id<BaseVault<TEST_QUOTE>>(vault_id);
        let cap = test.take_from_sender<base_vault::BaseCap>();
        base_vault::set_paused(&mut vault, &cap, paused);
        return_shared(vault);
        test.return_to_sender(cap);
    }
}
