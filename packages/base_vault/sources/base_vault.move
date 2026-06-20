/// Cash-only shared liquidity warehouse for CallIt strategies.
module base_vault::base_vault;

use sui::{
    balance::{Self, Balance},
    coin::{Self, Coin, TreasuryCap},
    event,
    object::{Self, ID, UID},
};

const EPaused: u64 = 1;
const EWrongBaseVaultCap: u64 = 2;
const EZeroDeposit: u64 = 3;
const EZeroShares: u64 = 4;
const ECashLow: u64 = 5;

public struct BASE_VAULT has drop {}

public struct BaseVault<phantom Quote> has key {
    id: UID,
    treasury: TreasuryCap<BASE_VAULT>,
    cash: Balance<Quote>,
    paused: bool,
}

public struct BaseVaultCap has key, store {
    id: UID,
    vault_id: ID,
}

public struct BaseVaultCreated has copy, drop {
    vault_id: ID,
    cap_id: ID,
}

public struct BaseDeposited has copy, drop {
    vault_id: ID,
    depositor: address,
    amount: u64,
    shares_minted: u64,
    nav_before: u64,
}

public struct BaseWithdrawn has copy, drop {
    vault_id: ID,
    owner: address,
    shares_burned: u64,
    amount_out: u64,
    nav_before: u64,
}

public struct BasePaused has copy, drop {
    vault_id: ID,
    paused: bool,
}

#[allow(deprecated_usage)]
fun init(witness: BASE_VAULT, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"cBASE",
        b"CallIt Base Vault Share",
        b"Tokenized claim on the CallIt cash-only Base Vault.",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}

public fun create_vault<Quote>(
    treasury: TreasuryCap<BASE_VAULT>,
    ctx: &mut TxContext,
): (BaseVault<Quote>, BaseVaultCap) {
    let vault = BaseVault<Quote> {
        id: object::new(ctx),
        treasury,
        cash: balance::zero(),
        paused: false,
    };
    let vault_id = vault.id.to_inner();
    let cap = BaseVaultCap { id: object::new(ctx), vault_id };

    event::emit(BaseVaultCreated { vault_id, cap_id: cap.id.to_inner() });

    (vault, cap)
}

public fun share_vault<Quote>(vault: BaseVault<Quote>) {
    transfer::share_object(vault);
}

public fun deposit<Quote>(
    vault: &mut BaseVault<Quote>,
    funds: Coin<Quote>,
    ctx: &mut TxContext,
): Coin<BASE_VAULT> {
    assert!(!vault.paused, EPaused);
    let amount = funds.value();
    assert!(amount > 0, EZeroDeposit);

    let nav_before = vault.nav();
    let shares = shares_for_deposit(nav_before, vault.share_supply(), amount);
    assert!(shares > 0, EZeroShares);

    vault.cash.join(funds.into_balance());
    let minted = coin::mint(&mut vault.treasury, shares, ctx);

    event::emit(BaseDeposited {
        vault_id: vault.id.to_inner(),
        depositor: ctx.sender(),
        amount,
        shares_minted: shares,
        nav_before,
    });

    minted
}

public fun withdraw<Quote>(
    vault: &mut BaseVault<Quote>,
    shares: Coin<BASE_VAULT>,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert!(!vault.paused, EPaused);
    let share_amount = shares.value();
    assert!(share_amount > 0, EZeroShares);

    let nav_before = vault.nav();
    let amount_out = amount_for_shares(nav_before, vault.share_supply(), share_amount);
    assert!(amount_out > 0, EZeroDeposit);
    assert!(vault.cash.value() >= amount_out, ECashLow);

    coin::burn(&mut vault.treasury, shares);
    let out = vault.cash.split(amount_out).into_coin(ctx);

    event::emit(BaseWithdrawn {
        vault_id: vault.id.to_inner(),
        owner: ctx.sender(),
        shares_burned: share_amount,
        amount_out,
        nav_before,
    });

    out
}

public fun set_paused<Quote>(vault: &mut BaseVault<Quote>, cap: &BaseVaultCap, paused: bool) {
    assert_base_vault_cap(vault, cap);
    vault.paused = paused;
    event::emit(BasePaused { vault_id: vault.id.to_inner(), paused });
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

public fun value_for_shares<Quote>(vault: &BaseVault<Quote>, shares: u64): u64 {
    amount_for_shares(vault.nav(), vault.share_supply(), shares)
}

public fun id<Quote>(vault: &BaseVault<Quote>): ID { vault.id.to_inner() }

public fun paused<Quote>(vault: &BaseVault<Quote>): bool { vault.paused }

public fun nav<Quote>(vault: &BaseVault<Quote>): u64 { vault.cash.value() }

public fun cash_value<Quote>(vault: &BaseVault<Quote>): u64 { vault.cash.value() }

public fun share_supply<Quote>(vault: &BaseVault<Quote>): u64 { vault.treasury.total_supply() }

public fun cap_id(cap: &BaseVaultCap): ID { cap.id.to_inner() }

public fun cap_vault_id(cap: &BaseVaultCap): ID { cap.vault_id }

public(package) fun assert_base_vault<Quote>(vault: &BaseVault<Quote>, expected_id: ID) {
    assert!(vault.id.to_inner() == expected_id, EWrongBaseVaultCap);
}

fun assert_base_vault_cap<Quote>(vault: &BaseVault<Quote>, cap: &BaseVaultCap) {
    assert!(cap.vault_id == vault.id.to_inner(), EWrongBaseVaultCap);
}

#[test_only]
public fun add_cash_for_testing<Quote>(vault: &mut BaseVault<Quote>, funds: Coin<Quote>) {
    vault.cash.join(funds.into_balance());
}

#[test_only]
public fun destroy_cap_for_testing(cap: BaseVaultCap) {
    let BaseVaultCap { id, vault_id: _ } = cap;
    id.delete();
}
