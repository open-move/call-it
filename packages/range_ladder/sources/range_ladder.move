/// Managed Range Ladder vault using true DeepBook Predict RangeKey positions.
module range_ladder::range_ladder;

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
    oracle::{Self, OracleSVI},
    predict::{Predict},
    predict_manager::PredictManager,
    range_key::{Self, RangeKey},
};

use range_ladder::policy::{Self, RangeLadderPolicy, RangePosition, RangeRung};

const BPS_DENOMINATOR: u64 = 10_000;

const EPaused: u64 = 1;
const EWrongVaultCap: u64 = 2;
const ERoundAlreadyActive: u64 = 3;
const ENoActiveRound: u64 = 4;
const EWrongManager: u64 = 5;
const ENotManagerOwner: u64 = 6;
const EManagerNotDedicated: u64 = 7;
const EOracleNotActive: u64 = 8;
const EOracleNotSettled: u64 = 9;
const EWrongPredict: u64 = 10;
const EWrongOracle: u64 = 11;
const EInvalidPremiumBudget: u64 = 12;
const ECashLow: u64 = 13;
const EZeroDeposit: u64 = 14;
const EZeroShares: u64 = 15;
const ERangeAskAboveCeiling: u64 = 16;
const EExceededPremiumBudget: u64 = 17;
const ERangePositionChanged: u64 = 18;
const EInvalidRangePayout: u64 = 19;

public struct RANGE_LADDER has drop {}

public struct RangeRound has copy, drop, store {
    predict_id: ID,
    oracle_id: ID,
    positions: vector<RangePosition>,
}

public struct RangeLadderVault<phantom Quote> has key {
    id: UID,
    treasury: TreasuryCap<RANGE_LADDER>,
    cash: Balance<Quote>,
    manager_id: ID,
    active_round: Option<RangeRound>,
    policy: RangeLadderPolicy,
    paused: bool,
}

public struct VaultCap has key, store {
    id: UID,
    vault_id: ID,
}

public struct RangeLadderVaultCreated has copy, drop {
    vault_id: ID,
    manager_id: ID,
    cap_id: ID,
}

public struct RangeLadderDeposited has copy, drop {
    vault_id: ID,
    depositor: address,
    amount: u64,
    shares_minted: u64,
    nav_before: u64,
}

public struct RangeLadderWithdrawn has copy, drop {
    vault_id: ID,
    owner: address,
    shares_burned: u64,
    amount_out: u64,
    nav_before: u64,
}

public struct RangeRoundStarted has copy, drop {
    vault_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    premium_budget_amount: u64,
    total_premium_spent: u64,
    refund_amount: u64,
    reserve_amount: u64,
    range_count: u64,
}

public struct RangeRoundSettled has copy, drop {
    vault_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    payout_swept: u64,
    nav_after_settle: u64,
}

#[allow(deprecated_usage)]
fun init(witness: RANGE_LADDER, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"cRANGE",
        b"CallIt Range Ladder Vault Share",
        b"Tokenized share of the CallIt managed Range Ladder vault.",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}

public fun create_vault<Quote>(
    treasury: TreasuryCap<RANGE_LADDER>,
    manager: &PredictManager,
    policy: RangeLadderPolicy,
    ctx: &mut TxContext,
): (RangeLadderVault<Quote>, VaultCap) {
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    let manager_id = object::id(manager);
    let vault = RangeLadderVault<Quote> {
        id: object::new(ctx),
        treasury,
        cash: balance::zero(),
        manager_id,
        active_round: option::none(),
        policy,
        paused: false,
    };
    let vault_id = vault.id.to_inner();
    let cap = VaultCap { id: object::new(ctx), vault_id };

    event::emit(RangeLadderVaultCreated {
        vault_id,
        manager_id,
        cap_id: cap.id.to_inner(),
    });

    (vault, cap)
}

public fun share_vault<Quote>(vault: RangeLadderVault<Quote>) {
    transfer::share_object(vault);
}

public fun deposit<Quote>(
    vault: &mut RangeLadderVault<Quote>,
    funds: Coin<Quote>,
    ctx: &mut TxContext,
): Coin<RANGE_LADDER> {
    assert!(!vault.paused, EPaused);
    assert!(option::is_none(&vault.active_round), ERoundAlreadyActive);
    let amount = funds.value();
    assert!(amount > 0, EZeroDeposit);

    let nav_before = vault.nav();
    let shares = shares_for_deposit(nav_before, vault.share_supply(), amount);
    assert!(shares > 0, EZeroShares);

    vault.cash.join(funds.into_balance());
    let minted = coin::mint(&mut vault.treasury, shares, ctx);

    event::emit(RangeLadderDeposited {
        vault_id: vault.id.to_inner(),
        depositor: ctx.sender(),
        amount,
        shares_minted: shares,
        nav_before,
    });

    minted
}

public fun withdraw<Quote>(
    vault: &mut RangeLadderVault<Quote>,
    shares: Coin<RANGE_LADDER>,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert!(option::is_none(&vault.active_round), ERoundAlreadyActive);
    let share_amount = shares.value();
    assert!(share_amount > 0, EZeroShares);

    let nav_before = vault.nav();
    let amount_out = amount_for_shares(nav_before, vault.share_supply(), share_amount);
    assert!(vault.cash.value() >= amount_out, ECashLow);

    coin::burn(&mut vault.treasury, shares);
    let out = vault.cash.split(amount_out).into_coin(ctx);

    event::emit(RangeLadderWithdrawn {
        vault_id: vault.id.to_inner(),
        owner: ctx.sender(),
        shares_burned: share_amount,
        amount_out,
        nav_before,
    });

    out
}

public fun start_round<Quote>(
    vault: &mut RangeLadderVault<Quote>,
    cap: &VaultCap,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    rungs: vector<RangeRung>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!vault.paused, EPaused);
    assert_vault_cap(vault, cap);
    assert!(option::is_none(&vault.active_round), ERoundAlreadyActive);
    assert!(object::id(manager) == vault.manager_id, EWrongManager);
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    assert!(manager.balance<Quote>() == 0, EManagerNotDedicated);
    assert!(oracle.status(clock) == oracle::status_active(), EOracleNotActive);
    policy::assert_valid_rungs(&vault.policy, &rungs);

    let nav_now = vault.nav();
    assert!(nav_now > 0, EZeroDeposit);
    let premium_budget_amount = bps_amount(nav_now, policy::premium_budget_bps(&vault.policy));
    let reserve_amount = bps_amount(nav_now, policy::reserve_bps(&vault.policy));
    assert!(premium_budget_amount > 0, EInvalidPremiumBudget);
    assert!(vault.cash.value() >= premium_budget_amount + reserve_amount, ECashLow);

    let manager_balance_before = manager.balance<Quote>();
    let premium_coin = vault.cash.split(premium_budget_amount).into_coin(ctx);
    manager.deposit<Quote>(premium_coin, ctx);

    let positions = mint_ranges<Quote>(predict, manager, oracle, rungs, clock, ctx, &vault.policy);
    let manager_balance_after_mint = manager.balance<Quote>();
    assert!(manager_balance_after_mint >= manager_balance_before, EExceededPremiumBudget);
    let total_premium_spent = premium_budget_amount - (manager_balance_after_mint - manager_balance_before);
    assert!(total_premium_spent <= premium_budget_amount, EExceededPremiumBudget);

    let refund_amount = manager_balance_after_mint - manager_balance_before;
    if (refund_amount > 0) {
        vault.cash.join(manager.withdraw<Quote>(refund_amount, ctx).into_balance());
    };

    let range_count = positions.length();
    vault.active_round = option::some(RangeRound {
        predict_id: object::id(predict),
        oracle_id: oracle.id(),
        positions,
    });

    event::emit(RangeRoundStarted {
        vault_id: vault.id.to_inner(),
        predict_id: object::id(predict),
        manager_id: vault.manager_id,
        oracle_id: oracle.id(),
        premium_budget_amount,
        total_premium_spent,
        refund_amount,
        reserve_amount,
        range_count,
    });
}

public fun settle_round<Quote>(
    vault: &mut RangeLadderVault<Quote>,
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

    let round = option::extract(&mut vault.active_round);
    assert!(object::id(predict) == round.predict_id, EWrongPredict);
    assert!(oracle.id() == round.oracle_id, EWrongOracle);

    let manager_balance_before = manager.balance<Quote>();
    round.positions.do!(|position| {
        let key = position.position_key();
        let quantity = position.position_quantity();
        assert_range_position(manager, key, quantity);
        predict.redeem_range<Quote>(manager, oracle, key, quantity, clock, ctx);
    });

    let manager_balance_after = manager.balance<Quote>();
    assert!(manager_balance_after >= manager_balance_before, EInvalidRangePayout);
    let payout_swept = manager_balance_after - manager_balance_before;
    if (payout_swept > 0) {
        vault.cash.join(manager.withdraw<Quote>(payout_swept, ctx).into_balance());
    };

    event::emit(RangeRoundSettled {
        vault_id: vault.id.to_inner(),
        predict_id: round.predict_id,
        manager_id: vault.manager_id,
        oracle_id: round.oracle_id,
        payout_swept,
        nav_after_settle: vault.nav(),
    });
}

public fun set_paused<Quote>(vault: &mut RangeLadderVault<Quote>, cap: &VaultCap, paused: bool) {
    assert_vault_cap(vault, cap);
    vault.paused = paused;
}

public fun set_policy<Quote>(vault: &mut RangeLadderVault<Quote>, cap: &VaultCap, policy: RangeLadderPolicy) {
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

public fun id<Quote>(vault: &RangeLadderVault<Quote>): ID { vault.id.to_inner() }

public fun manager_id<Quote>(vault: &RangeLadderVault<Quote>): ID { vault.manager_id }

public fun paused<Quote>(vault: &RangeLadderVault<Quote>): bool { vault.paused }

public fun has_active_round<Quote>(vault: &RangeLadderVault<Quote>): bool { option::is_some(&vault.active_round) }

public fun active_round<Quote>(vault: &RangeLadderVault<Quote>): Option<RangeRound> { vault.active_round }

public fun policy<Quote>(vault: &RangeLadderVault<Quote>): RangeLadderPolicy { vault.policy }

public fun nav<Quote>(vault: &RangeLadderVault<Quote>): u64 { vault.cash.value() }

public fun share_supply<Quote>(vault: &RangeLadderVault<Quote>): u64 { vault.treasury.total_supply() }

public fun cash_value<Quote>(vault: &RangeLadderVault<Quote>): u64 { vault.cash.value() }

public fun cap_id(cap: &VaultCap): ID { cap.id.to_inner() }

public fun cap_vault_id(cap: &VaultCap): ID { cap.vault_id }

public fun round_predict_id(round: &RangeRound): ID { round.predict_id }

public fun round_oracle_id(round: &RangeRound): ID { round.oracle_id }

public fun round_positions(round: &RangeRound): vector<RangePosition> { round.positions }

public fun round_position_count(round: &RangeRound): u64 { round.positions.length() }

public(package) fun assert_vault_cap<Quote>(vault: &RangeLadderVault<Quote>, cap: &VaultCap) {
    assert!(cap.vault_id == vault.id.to_inner(), EWrongVaultCap);
}

fun mint_ranges<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    rungs: vector<RangeRung>,
    clock: &Clock,
    ctx: &mut TxContext,
    vault_policy: &RangeLadderPolicy,
): vector<RangePosition> {
    let mut minted = vector[];
    rungs.do!(|rung| {
        let key = range_key::new(oracle.id(), oracle.expiry(), rung.lower_strike(), rung.higher_strike());
        assert_range_position(manager, key, 0);
        let (ask_cost, _) = predict.get_range_trade_amounts(oracle, key, rung.quantity(), clock);
        assert_range_ask_within_ceiling(vault_policy, ask_cost, rung.quantity());

        let balance_before = manager.balance<Quote>();
        predict.mint_range<Quote>(manager, oracle, key, rung.quantity(), clock, ctx);
        let balance_after = manager.balance<Quote>();
        assert!(balance_after <= balance_before, EExceededPremiumBudget);
        let cost = balance_before - balance_after;
        assert_range_ask_within_ceiling(vault_policy, cost, rung.quantity());
        minted.push_back(policy::new_position(key, rung.quantity(), cost));
    });
    minted
}

fun assert_range_position(manager: &PredictManager, key: RangeKey, expected_quantity: u64) {
    assert!(manager.range_position(key) == expected_quantity, ERangePositionChanged);
}

fun assert_range_ask_within_ceiling(vault_policy: &RangeLadderPolicy, ask_cost: u64, quantity: u64) {
    assert!((ask_cost as u128) * (BPS_DENOMINATOR as u128) <= (quantity as u128) * (policy::max_range_ask_bps(vault_policy) as u128), ERangeAskAboveCeiling);
}

fun bps_amount(amount: u64, bps: u16): u64 {
    ((amount as u128) * (bps as u128) / (BPS_DENOMINATOR as u128)) as u64
}

#[test_only]
public fun set_active_round_predict_id_for_testing<Quote>(vault: &mut RangeLadderVault<Quote>, predict_id: ID) {
    let round = option::borrow_mut(&mut vault.active_round);
    round.predict_id = predict_id;
}

#[test_only]
public fun destroy_cap_for_testing(cap: VaultCap) {
    let VaultCap { id, vault_id: _ } = cap;
    id.delete();
}
