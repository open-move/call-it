/// Cash-only shared liquidity warehouse for CallIt strategies.
///
/// The base vault is deliberately dumb: it holds a single `Balance<Quote>` and
/// mints/burns NAV-proportional share coins (`BASE_VAULT`) against it. NAV is
/// just the cash on hand — there is no yield, P&L, or deployed capital here, so
/// a share's value is effectively constant (1:1 minus integer-division dust).
///
/// Strategies are the only depositors: each parks its idle/reserve capital here
/// as base shares and pulls it back when it needs quote. Holding the reserve in
/// one shared pool (rather than as bare cash inside each strategy) keeps strategy
/// accounting in a single unit and lets the withdrawal queue reserve in
/// base-share terms. Because every base share is always fully backed by cash,
/// one strategy's claims never interfere with another's.
module base_vault::base_vault;

use sui::{
    balance::{Self, Balance},
    coin::{Self, Coin, TreasuryCap},
    event,
    object::{Self, ID, UID},
};

#[error]
const EPaused: vector<u8> = b"Vault is paused";

#[error]
const EWrongBaseVaultCap: vector<u8> = b"Cap does not authorize this vault";

#[error]
const EZeroDeposit: vector<u8> = b"Amount must resolve to a non-zero quote value";

#[error]
const EZeroShares: vector<u8> = b"Share amount must be non-zero";

#[error]
const ECashLow: vector<u8> = b"Vault cash is insufficient for this withdrawal";

/// One-time witness for the `BASE_VAULT` share currency.
public struct BASE_VAULT has drop {}

/// The shared warehouse object. One per quote asset.
public struct BaseVault<phantom Quote> has key {
    id: UID,
    /// Mints on deposit, burns on withdraw; total supply == circulating shares.
    treasury: TreasuryCap<BASE_VAULT>,
    /// The entire backing of the vault; NAV == `cash.value()`.
    cash: Balance<Quote>,
    /// Emergency circuit breaker. Blocks deposit and withdraw while set.
    paused: bool,
}

/// Admin capability bound to a specific vault (pause control).
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

/// Publishes the `BASE_VAULT` share currency and hands the treasury to the
/// publisher, who then bootstraps a vault via `create_vault`.
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

/// Bootstrap an empty vault. The returned cap controls pausing; the vault must
/// be shared via `share_vault` before it can be used.
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

/// Deposit `funds` and receive NAV-proportional share coins. Shares are priced
/// against NAV *before* the deposit lands, so existing holders are not diluted.
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

/// Burn `shares` and receive the pro-rata slice of vault cash. Since NAV is
/// cash, `ECashLow` is a defensive invariant check that should never bind for a
/// cash-only vault; a paused vault is the only expected failure.
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

/// Toggle the emergency pause. Pausing blocks both deposit and withdraw, so it
/// is a hard freeze — use only as a circuit breaker.
public fun set_paused<Quote>(vault: &mut BaseVault<Quote>, cap: &BaseVaultCap, paused: bool) {
    assert_base_vault_cap(vault, cap);
    vault.paused = paused;
    event::emit(BasePaused { vault_id: vault.id.to_inner(), paused });
}

/// Shares minted for a deposit of `amount` into a vault at `nav_before` /
/// `supply`. First deposit (empty vault) mints 1:1; thereafter pro-rata, with
/// integer division rounding in the vault's favor.
public fun shares_for_deposit(nav_before: u64, supply: u64, amount: u64): u64 {
    if (supply == 0 || nav_before == 0) {
        amount
    } else {
        ((amount as u128) * (supply as u128) / (nav_before as u128)) as u64
    }
}

/// Quote owed for burning `shares` against a vault at `nav_now` / `supply`.
/// Rounds in the vault's favor.
public fun amount_for_shares(nav_now: u64, supply: u64, shares: u64): u64 {
    assert!(supply > 0, EZeroShares);
    ((shares as u128) * (nav_now as u128) / (supply as u128)) as u64
}

/// Current quote value of `shares` at the live NAV.
public fun value_for_shares<Quote>(vault: &BaseVault<Quote>, shares: u64): u64 {
    amount_for_shares(vault.nav(), vault.share_supply(), shares)
}

public fun id<Quote>(vault: &BaseVault<Quote>): ID { vault.id.to_inner() }

public fun paused<Quote>(vault: &BaseVault<Quote>): bool { vault.paused }

/// NAV of a cash-only vault is simply the cash on hand.
public fun nav<Quote>(vault: &BaseVault<Quote>): u64 { vault.cash.value() }

public fun cash_value<Quote>(vault: &BaseVault<Quote>): u64 { vault.cash.value() }

public fun share_supply<Quote>(vault: &BaseVault<Quote>): u64 { vault.treasury.total_supply() }

public fun cap_id(cap: &BaseVaultCap): ID { cap.id.to_inner() }

public fun cap_vault_id(cap: &BaseVaultCap): ID { cap.vault_id }

/// Aborts unless `vault` is the one the caller expects. Strategies hold a vault
/// id and use this to refuse a mismatched vault object passed into a call.
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
