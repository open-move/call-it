/// Oracle-bound Shield round vault accounting.
module callit_vaults::shield_vault;

use std::option::{Self, Option};
use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin, TreasuryCap},
    event,
    object::{Self, ID, UID},
    transfer,
};

use deepbook_predict::{
    market_key::{Self, MarketKey},
    oracle::{Self, OracleSVI},
    plp::PLP,
    predict::{Self, Predict},
    predict_manager::PredictManager,
};

use callit_vaults::policy::{Self, VaultPolicy};

const BPS_DENOMINATOR: u64 = 10_000;

const EPaused: u64 = 1;
const EWrongVaultCap: u64 = 2;
const ERoundAlreadyActive: u64 = 4;
const ENoActiveRound: u64 = 5;
const EWrongManager: u64 = 6;
const ENotManagerOwner: u64 = 7;
const EOracleNotActive: u64 = 8;
const EOracleNotSettled: u64 = 9;
const EWrongOracle: u64 = 10;
const EInvalidHedgeStrike: u64 = 11;
const EZeroQuantity: u64 = 12;
const EZeroDeposit: u64 = 13;
const EZeroShares: u64 = 14;
const EInvalidHedgeBudget: u64 = 15;
const EAskAboveCeiling: u64 = 16;
const EExceededHedgeBudget: u64 = 17;
const EHedgePositionChanged: u64 = 18;
const ECashLow: u64 = 19;
const ESettledPayoutMissing: u64 = 20;
const EInvalidPlpAllocation: u64 = 21;
const EPlpAllocated: u64 = 23;
const EManagerNotDedicated: u64 = 24;
const ERoundPositionMissing: u64 = 25;
const ERoundAlreadySettled: u64 = 26;
const ERoundNotSettled: u64 = 27;
const EWrongPredict: u64 = 28;

public struct SHIELD_VAULT has drop {}

public struct ShieldRound has copy, drop, store {
    predict_id: ID,
    oracle_id: ID,
    strike: u64,
    hedge_quantity: u64,
    settled: bool,
}

public struct ShieldVault<phantom Quote> has key {
    id: UID,
    treasury: TreasuryCap<SHIELD_VAULT>,
    cash: Balance<Quote>,
    plp: Balance<PLP>,
    plp_cost_basis: u64,
    manager_id: ID,
    active_round: Option<ShieldRound>,
    policy: VaultPolicy,
    paused: bool,
}

public struct VaultCap has key, store {
    id: UID,
    vault_id: ID,
}

public struct ShieldVaultCreated has copy, drop {
    vault_id: ID,
    manager_id: ID,
    cap_id: ID,
}

public struct ShieldVaultDeposited has copy, drop {
    vault_id: ID,
    depositor: address,
    amount: u64,
    shares_minted: u64,
    nav_before: u64,
}

public struct ShieldVaultWithdrawn has copy, drop {
    vault_id: ID,
    owner: address,
    shares_burned: u64,
    amount_out: u64,
    nav_before: u64,
}

public struct ShieldRoundStarted has copy, drop {
    vault_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    hedge_budget_amount: u64,
    premium_spent: u64,
    refund_amount: u64,
    plp_cost_basis: u64,
    plp_shares: u64,
    reserve_amount: u64,
    ask_cost: u64,
    bid_cost: u64,
}

public struct ShieldRoundSettled has copy, drop {
    vault_id: ID,
    oracle_id: ID,
    payout_swept: u64,
    nav_after_settle: u64,
}

public struct ShieldRoundRealized has copy, drop {
    vault_id: ID,
    oracle_id: ID,
    plp_realized: u64,
    nav_after_realize: u64,
}

#[allow(deprecated_usage)]
fun init(witness: SHIELD_VAULT, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"cSHIELD",
        b"CallIt Shield Vault Share",
        b"Tokenized share of the CallIt Shield oracle-round vault.",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}

public fun create_vault<Quote>(
    treasury: TreasuryCap<SHIELD_VAULT>,
    manager: &PredictManager,
    policy: VaultPolicy,
    ctx: &mut TxContext,
): (ShieldVault<Quote>, VaultCap) {
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    let manager_id = object::id(manager);
    let vault = ShieldVault<Quote> {
        id: object::new(ctx),
        treasury,
        cash: balance::zero(),
        plp: balance::zero(),
        plp_cost_basis: 0,
        manager_id,
        active_round: option::none(),
        policy,
        paused: false,
    };
    let vault_id = vault.id.to_inner();
    let cap = VaultCap { id: object::new(ctx), vault_id };

    event::emit(ShieldVaultCreated {
        vault_id,
        manager_id,
        cap_id: cap.id.to_inner(),
    });

    (vault, cap)
}

public fun share_vault<Quote>(vault: ShieldVault<Quote>) {
    transfer::share_object(vault);
}

public fun deposit<Quote>(
    vault: &mut ShieldVault<Quote>,
    funds: Coin<Quote>,
    ctx: &mut TxContext,
): Coin<SHIELD_VAULT> {
    assert!(!vault.paused, EPaused);
    assert!(option::is_none(&vault.active_round), ERoundAlreadyActive);
    assert!(vault.plp_cost_basis == 0, EPlpAllocated);
    let amount = funds.value();
    assert!(amount > 0, EZeroDeposit);

    let nav_before = vault.nav();
    let supply = vault.share_supply();
    let shares = shares_for_deposit(nav_before, supply, amount);
    assert!(shares > 0, EZeroShares);

    vault.cash.join(funds.into_balance());
    let minted = coin::mint(&mut vault.treasury, shares, ctx);

    event::emit(ShieldVaultDeposited {
        vault_id: vault.id.to_inner(),
        depositor: ctx.sender(),
        amount,
        shares_minted: shares,
        nav_before,
    });

    minted
}

public fun withdraw<Quote>(
    vault: &mut ShieldVault<Quote>,
    shares: Coin<SHIELD_VAULT>,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert!(option::is_none(&vault.active_round), ERoundAlreadyActive);
    assert!(vault.plp_cost_basis == 0, EPlpAllocated);
    let share_amount = shares.value();
    assert!(share_amount > 0, EZeroShares);

    let nav_before = vault.nav();
    let amount_out = amount_for_shares(nav_before, vault.share_supply(), share_amount);
    assert!(vault.cash.value() >= amount_out, ECashLow);

    coin::burn(&mut vault.treasury, shares);
    let out = vault.cash.split(amount_out).into_coin(ctx);

    event::emit(ShieldVaultWithdrawn {
        vault_id: vault.id.to_inner(),
        owner: ctx.sender(),
        shares_burned: share_amount,
        amount_out,
        nav_before,
    });

    out
}

public fun start_round<Quote>(
    vault: &mut ShieldVault<Quote>,
    cap: &VaultCap,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    hedge_strike: u64,
    hedge_quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!vault.paused, EPaused);
    assert_vault_cap(vault, cap);
    assert!(option::is_none(&vault.active_round), ERoundAlreadyActive);
    assert!(vault.plp_cost_basis == 0, EPlpAllocated);
    assert!(object::id(manager) == vault.manager_id, EWrongManager);
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    assert!(manager.balance<Quote>() == 0, EManagerNotDedicated);
    assert!(oracle.status(clock) == oracle::status_active(), EOracleNotActive);
    assert!(hedge_quantity > 0, EZeroQuantity);
    assert_valid_downside_strike(&vault.policy, oracle, hedge_strike);

    let nav_now = vault.nav();
    assert!(nav_now > 0, EZeroDeposit);
    let hedge_budget_amount = bps_amount(nav_now, policy::hedge_budget_bps(&vault.policy));
    let reserve_amount = bps_amount(nav_now, policy::reserve_bps(&vault.policy));
    let max_plp_cost_basis = bps_amount(nav_now, policy::max_plp_allocation_bps(&vault.policy));
    assert!(hedge_budget_amount > 0, EInvalidHedgeBudget);
    assert!(vault.cash.value() >= hedge_budget_amount + reserve_amount, ECashLow);

    let expiry_ms = oracle.expiry();
    let key = market_key::new(oracle.id(), expiry_ms, hedge_strike, false);
    assert_hedge_position(manager, key, 0);
    let (ask_cost, bid_cost) = predict.get_trade_amounts(oracle, key, hedge_quantity, clock);
    assert_ask_within_ceiling(&vault.policy, ask_cost, hedge_quantity);

    let manager_balance_before = manager.balance<Quote>();
    let hedge_coin = vault.cash.split(hedge_budget_amount).into_coin(ctx);
    manager.deposit<Quote>(hedge_coin, ctx);
    let manager_balance_after_deposit = manager.balance<Quote>();
    predict.mint<Quote>(manager, oracle, key, hedge_quantity, clock, ctx);
    let manager_balance_after_mint = manager.balance<Quote>();
    assert!(manager_balance_after_mint >= manager_balance_before, EExceededHedgeBudget);
    let premium_spent = manager_balance_after_deposit - manager_balance_after_mint;
    assert_ask_within_ceiling(&vault.policy, premium_spent, hedge_quantity);
    let refund_amount = manager_balance_after_mint - manager_balance_before;
    if (refund_amount > 0) {
        vault.cash.join(manager.withdraw<Quote>(refund_amount, ctx).into_balance());
    };

    let cash_after_hedge = vault.cash.value();
    let deployable_above_reserve = if (cash_after_hedge > reserve_amount) {
        cash_after_hedge - reserve_amount
    } else {
        0
    };
    let plp_cost_basis = if (deployable_above_reserve > max_plp_cost_basis) {
        max_plp_cost_basis
    } else {
        deployable_above_reserve
    };
    assert!(plp_cost_basis > 0, EInvalidPlpAllocation);

    let plp_coin = predict.supply<Quote>(vault.cash.split(plp_cost_basis).into_coin(ctx), clock, ctx);
    let plp_shares = plp_coin.value();
    vault.plp.join(plp_coin.into_balance());
    vault.plp_cost_basis = plp_cost_basis;

    vault.active_round = option::some(ShieldRound {
        predict_id: object::id(predict),
        oracle_id: oracle.id(),
        strike: hedge_strike,
        hedge_quantity,
        settled: false,
    });

    event::emit(ShieldRoundStarted {
        vault_id: vault.id.to_inner(),
        predict_id: object::id(predict),
        manager_id: vault.manager_id,
        oracle_id: oracle.id(),
        hedge_budget_amount,
        premium_spent,
        refund_amount,
        plp_cost_basis,
        plp_shares,
        reserve_amount,
        ask_cost,
        bid_cost,
    });
}

public fun settle_round<Quote>(
    vault: &mut ShieldVault<Quote>,
    cap: &VaultCap,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_vault_cap(vault, cap);
    assert!(option::is_some(&vault.active_round), ENoActiveRound);
    assert!(object::id(manager) == vault.manager_id, EWrongManager);
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    assert!(oracle.is_settled(), EOracleNotSettled);

    let round = *option::borrow(&vault.active_round);
    assert!(!round.settled, ERoundAlreadySettled);
    assert!(object::id(predict) == round.predict_id, EWrongPredict);
    assert!(oracle.id() == round.oracle_id, EWrongOracle);

    let key = market_key::new(round.oracle_id, oracle.expiry(), round.strike, false);
    let remaining = manager.position(key);
    assert!(remaining >= round.hedge_quantity, ERoundPositionMissing);
    let manager_balance_before_redeem = manager.balance<Quote>();
    predict.redeem_permissionless<Quote>(manager, oracle, key, round.hedge_quantity, clock, ctx);

    let expected_payout = settled_payout(&round, oracle);
    let manager_balance_after_redeem = manager.balance<Quote>();
    assert!((manager_balance_after_redeem as u128) >= (manager_balance_before_redeem as u128) + (expected_payout as u128), ESettledPayoutMissing);

    let mut payout_swept = 0;
    if (expected_payout > 0) {
        let proceeds = manager.withdraw<Quote>(expected_payout, ctx);
        payout_swept = proceeds.value();
        vault.cash.join(proceeds.into_balance());
    };

    let round_mut = option::borrow_mut(&mut vault.active_round);
    round_mut.settled = true;

    event::emit(ShieldRoundSettled {
        vault_id: vault.id.to_inner(),
        oracle_id: round.oracle_id,
        payout_swept,
        nav_after_settle: vault.nav(),
    });
}

public fun realize_round<Quote>(
    vault: &mut ShieldVault<Quote>,
    cap: &VaultCap,
    predict: &mut Predict,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_vault_cap(vault, cap);
    assert!(option::is_some(&vault.active_round), ENoActiveRound);
    let round = option::extract(&mut vault.active_round);
    assert!(round.settled, ERoundNotSettled);
    assert!(object::id(predict) == round.predict_id, EWrongPredict);

    let mut plp_realized = 0;
    if (vault.plp.value() > 0) {
        let plp_coin = vault.plp.withdraw_all().into_coin(ctx);
        let quote_out = predict.withdraw<Quote>(plp_coin, clock, ctx);
        plp_realized = quote_out.value();
        vault.cash.join(quote_out.into_balance());
    };

    vault.plp_cost_basis = 0;

    event::emit(ShieldRoundRealized {
        vault_id: vault.id.to_inner(),
        oracle_id: round.oracle_id,
        plp_realized,
        nav_after_realize: vault.nav(),
    });
}

public fun set_paused<Quote>(vault: &mut ShieldVault<Quote>, cap: &VaultCap, paused: bool) {
    assert_vault_cap(vault, cap);
    vault.paused = paused;
}

public fun set_policy<Quote>(vault: &mut ShieldVault<Quote>, cap: &VaultCap, policy: VaultPolicy) {
    assert_vault_cap(vault, cap);
    vault.policy = policy;
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

public fun id<Quote>(vault: &ShieldVault<Quote>): ID { vault.id.to_inner() }

public fun manager_id<Quote>(vault: &ShieldVault<Quote>): ID { vault.manager_id }

public fun paused<Quote>(vault: &ShieldVault<Quote>): bool { vault.paused }

public fun has_active_round<Quote>(vault: &ShieldVault<Quote>): bool { option::is_some(&vault.active_round) }

public fun active_round<Quote>(vault: &ShieldVault<Quote>): Option<ShieldRound> { vault.active_round }

public fun policy<Quote>(vault: &ShieldVault<Quote>): VaultPolicy { vault.policy }

public fun nav<Quote>(vault: &ShieldVault<Quote>): u64 { vault.cash.value() + vault.plp_cost_basis }

public fun share_supply<Quote>(vault: &ShieldVault<Quote>): u64 { vault.treasury.total_supply() }

public fun cash_value<Quote>(vault: &ShieldVault<Quote>): u64 { vault.cash.value() }

public fun plp_amount<Quote>(vault: &ShieldVault<Quote>): u64 { vault.plp.value() }

public fun plp_cost_basis<Quote>(vault: &ShieldVault<Quote>): u64 { vault.plp_cost_basis }

public fun cap_id(cap: &VaultCap): ID { cap.id.to_inner() }

public fun cap_vault_id(cap: &VaultCap): ID { cap.vault_id }

public fun round_oracle_id(round: &ShieldRound): ID { round.oracle_id }

public fun round_predict_id(round: &ShieldRound): ID { round.predict_id }

public fun round_strike(round: &ShieldRound): u64 { round.strike }

public fun round_hedge_quantity(round: &ShieldRound): u64 { round.hedge_quantity }

public fun round_settled(round: &ShieldRound): bool { round.settled }

public(package) fun assert_vault_cap<Quote>(vault: &ShieldVault<Quote>, cap: &VaultCap) {
    assert!(cap.vault_id == vault.id.to_inner(), EWrongVaultCap);
}

fun assert_valid_downside_strike(vault_policy: &VaultPolicy, oracle: &OracleSVI, hedge_strike: u64) {
    let spot = oracle.spot_price();
    let band_floor = spot - bps_amount(spot, policy::strike_band_bps(vault_policy));
    assert!(hedge_strike < spot && hedge_strike >= band_floor, EInvalidHedgeStrike);
}

fun bps_amount(amount: u64, bps: u16): u64 {
    ((amount as u128) * (bps as u128) / (BPS_DENOMINATOR as u128)) as u64
}

fun assert_ask_within_ceiling(vault_policy: &VaultPolicy, ask_cost: u64, quantity: u64) {
    assert!((ask_cost as u128) * (BPS_DENOMINATOR as u128) <= (quantity as u128) * (policy::max_hedge_ask_bps(vault_policy) as u128), EAskAboveCeiling);
}

fun assert_hedge_position(manager: &PredictManager, key: MarketKey, expected_quantity: u64) {
    assert!(manager.position(key) == expected_quantity, EHedgePositionChanged);
}

fun settled_payout(round: &ShieldRound, oracle: &OracleSVI): u64 {
    let settlement = option::destroy_some(oracle.settlement_price());
    if (settlement <= round.strike) {
        round.hedge_quantity
    } else {
        0
    }
}

#[test_only]
public fun set_active_round_predict_id_for_testing<Quote>(vault: &mut ShieldVault<Quote>, predict_id: ID) {
    let round = option::borrow_mut(&mut vault.active_round);
    round.predict_id = predict_id;
}

#[test_only]
public fun destroy_cap_for_testing(cap: VaultCap) {
    let VaultCap { id, vault_id: _ } = cap;
    id.delete();
}
