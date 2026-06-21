/// Managed one-leg directional UP-binary strategy backed by the CallIt Base Vault.
///
/// The strategy holds NO bare cash. Idle/reserve capital lives in the shared
/// Base Vault as `base_shares`; quote only ever exists as a transient local
/// `Coin<Quote>` inside a single function (redeem -> trade/settle -> redeposit).
///
/// Deposits and instant withdrawals are only allowed between rounds. While a
/// round is live, holders exit through the withdrawal queue: `request_withdraw`
/// escrows their BUP shares, `settle_round` snapshots a pro-rata slice of base
/// shares into `reserved_base_shares` and burns the escrow, and
/// `claim_withdrawal` pulls quote at the settled price. `cancel_request` backs
/// out before settlement; `sweep_stale_withdrawal` rolls an abandoned request
/// back into the strategy after a disclosed grace period.
module bullish_upside_strategy::strategy;

use std::option::{Self, Option};
use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin, TreasuryCap},
    event,
    object::{Self, ID, UID},
};

use base_vault::{
    base_vault::{Self, BASE_VAULT, BaseVault},
    withdrawal_queue::{Self, WithdrawalQueue},
};
use bullish_upside_strategy::bup::BUP;
use bullish_upside_strategy::policy::{Self, Policy};
use deepbook_predict::{
    market_key::{Self, MarketKey},
    oracle::{Self, OracleSVI},
    predict::{Predict},
    predict_manager::PredictManager,
};

/// Basis-point denominator: 10_000 bps == 100%.
const BPS_DENOMINATOR: u64 = 10_000;
/// Default rounds a settled request must age before it may be swept as stale.
const DEFAULT_STALE_GRACE_ROUNDS: u64 = 4;

#[error]
const EPaused: vector<u8> = b"Strategy is paused";

#[error]
const EWrongStrategyAdminCap: vector<u8> = b"Admin cap does not authorize this strategy";

#[error]
const ERoundAlreadyActive: vector<u8> = b"Operation requires no active round";

#[error]
const ENoActiveRound: vector<u8> = b"Operation requires an active round";

#[error]
const EWrongManager: vector<u8> = b"Manager is not the one bound to this strategy";

#[error]
const ENotManagerOwner: vector<u8> = b"Caller does not own the manager";

#[error]
const EManagerNotDedicated: vector<u8> = b"Manager must hold no quote before a round starts";

#[error]
const EOracleNotActive: vector<u8> = b"Oracle is not active";

#[error]
const EOracleNotSettled: vector<u8> = b"Oracle has not settled yet";

#[error]
const EWrongPredict: vector<u8> = b"Predict is not the one recorded for this round";

#[error]
const EWrongOracle: vector<u8> = b"Oracle is not the one recorded for this round";

#[error]
const EInvalidPremiumBudget: vector<u8> = b"Premium budget resolves to a zero amount";

#[error]
const ECashLow: vector<u8> = b"NAV is insufficient to cover premium budget plus reserve";

#[error]
const EZeroDeposit: vector<u8> = b"Amount must resolve to a non-zero quote value";

#[error]
const EZeroShares: vector<u8> = b"Share amount must be non-zero";

#[error]
const EUpAskAboveCeiling: vector<u8> = b"UP ask price exceeds the policy ceiling";

#[error]
const EExceededPremiumBudget: vector<u8> = b"Premium spent exceeds the budgeted amount";

#[error]
const EPositionChanged: vector<u8> = b"Manager position is not the expected size";

#[error]
const ESettledPayoutMissing: vector<u8> = b"Settled payout is missing from the manager balance";

#[error]
const EInvalidUpsideStrike: vector<u8> = b"Strike is not within the upside band above spot";

#[error]
const EZeroQuantity: vector<u8> = b"Quantity must be non-zero";

#[error]
const EWrongBaseVault: vector<u8> = b"Base vault is not the one bound to this strategy";

#[error]
const EWrongStrategyKeeperCap: vector<u8> = b"Keeper cap does not authorize this strategy";

#[error]
const EZeroGraceRounds: vector<u8> = b"Grace rounds must be non-zero";

/// Immutable record of the single live UP position, pinned at `start_round` and
/// re-checked at `settle_round` to ensure the same market is being closed.
public struct Round has copy, drop, store {
    /// Predict object the position was opened against.
    predict_id: ID,
    /// Oracle backing the market.
    oracle_id: ID,
    /// UP-binary strike chosen for the round.
    strike: u64,
    /// Number of UP units minted.
    quantity: u64,
}

/// The shared strategy object. Holds no bare cash — all value lives as base-vault
/// shares (see field docs) or transiently inside a single function call.
public struct Strategy<phantom Quote> has key {
    id: UID,
    /// Sole minter/burner of BUP shares; total supply == circulating shares.
    treasury: TreasuryCap<BUP>,
    /// The base vault this strategy parks its capital in; checked on every call.
    base_vault_id: ID,
    /// Deployable base-vault shares; counted in NAV.
    base_shares: Balance<BASE_VAULT>,
    /// Base-vault shares owed to settled withdrawal requests; never deployed and
    /// NOT counted in NAV.
    reserved_base_shares: Balance<BASE_VAULT>,
    /// Per-strategy withdrawal-request bookkeeping (share units only, no coins).
    queue: WithdrawalQueue,
    /// BUP share coins escrowed for open withdrawal requests.
    pending_shares: Balance<BUP>,
    /// The dedicated Predict manager that holds this strategy's positions.
    manager_id: ID,
    /// The live round, if any. `none` between rounds (deposits/instant exits ok).
    active_round: Option<Round>,
    /// Validated trading limits read each round.
    policy: Policy,
    /// Rounds after a request's settlement before anyone may sweep it as stale.
    stale_withdrawal_grace_rounds: u64,
    /// Emergency circuit breaker. Blocks deposit and start_round while set.
    paused: bool,
}

/// Admin capability bound to a specific strategy (pause, policy, grace control).
public struct StrategyAdminCap has key, store {
    id: UID,
    strategy_id: ID,
}

/// Keeper capability bound to a specific strategy (start/settle rounds).
public struct StrategyKeeperCap has key, store {
    id: UID,
    strategy_id: ID,
}

public struct StrategyCreated has copy, drop {
    strategy_id: ID,
    base_vault_id: ID,
    manager_id: ID,
    admin_cap_id: ID,
    keeper_cap_id: ID,
}

public struct StrategyDeposited has copy, drop {
    strategy_id: ID,
    depositor: address,
    amount: u64,
    shares_minted: u64,
    nav_before: u64,
}

public struct StrategyWithdrawn has copy, drop {
    strategy_id: ID,
    owner: address,
    shares_burned: u64,
    amount_out: u64,
    nav_before: u64,
}

public struct WithdrawalRequested has copy, drop {
    strategy_id: ID,
    owner: address,
    round: u64,
    shares: u64,
}

public struct WithdrawalCancelled has copy, drop {
    strategy_id: ID,
    owner: address,
    shares: u64,
}

public struct WithdrawalClaimed has copy, drop {
    strategy_id: ID,
    owner: address,
    base_shares: u64,
    amount_out: u64,
}

public struct WithdrawalSwept has copy, drop {
    strategy_id: ID,
    owner: address,
    base_shares: u64,
    shares_reissued: u64,
}

public struct RoundStarted has copy, drop {
    strategy_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    premium_budget_amount: u64,
    premium_spent: u64,
    refund_amount: u64,
    reserve_amount: u64,
    ask_cost: u64,
    bid_cost: u64,
}

public struct RoundSettled has copy, drop {
    strategy_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    round: u64,
    manager_balance_swept: u64,
    reserved_base_shares: u64,
    shares_burned: u64,
    nav_after_settle: u64,
}

/// Bootstrap a strategy bound to `base` and `manager`. The caller must own the
/// manager. Returns the strategy (share it via `share_strategy`) plus the admin
/// and keeper caps that authorize privileged calls against it.
public fun create_strategy<Quote>(
    treasury: TreasuryCap<BUP>,
    base: &BaseVault<Quote>,
    manager: &PredictManager,
    policy: Policy,
    ctx: &mut TxContext,
): (Strategy<Quote>, StrategyAdminCap, StrategyKeeperCap) {
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    let base_vault_id = base.id();
    let manager_id = object::id(manager);
    let strategy = Strategy<Quote> {
        id: object::new(ctx),
        treasury,
        base_vault_id,
        base_shares: balance::zero(),
        reserved_base_shares: balance::zero(),
        queue: withdrawal_queue::new(ctx),
        pending_shares: balance::zero(),
        manager_id,
        active_round: option::none(),
        policy,
        stale_withdrawal_grace_rounds: DEFAULT_STALE_GRACE_ROUNDS,
        paused: false,
    };
    let strategy_id = strategy.id.to_inner();
    let admin_cap = StrategyAdminCap { id: object::new(ctx), strategy_id };
    let keeper_cap = StrategyKeeperCap { id: object::new(ctx), strategy_id };

    event::emit(StrategyCreated {
        strategy_id,
        base_vault_id,
        manager_id,
        admin_cap_id: admin_cap.id.to_inner(),
        keeper_cap_id: keeper_cap.id.to_inner(),
    });

    (strategy, admin_cap, keeper_cap)
}

public fun share_strategy<Quote>(strategy: Strategy<Quote>) {
    transfer::share_object(strategy);
}

/// Deposit `funds` and receive NAV-proportional BUP shares. Only allowed between
/// rounds. The quote is immediately parked as base-vault shares; shares are
/// priced against NAV before the deposit, so existing holders are not diluted.
public fun deposit<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    funds: Coin<Quote>,
    ctx: &mut TxContext,
): Coin<BUP> {
    assert!(!strategy.paused, EPaused);
    assert_base_vault(strategy, base);
    assert!(option::is_none(&strategy.active_round), ERoundAlreadyActive);
    let amount = funds.value();
    assert!(amount > 0, EZeroDeposit);

    let nav_before = strategy.nav(base);
    let supply = strategy.share_supply();
    let base_coin = base_vault::deposit(base, funds, ctx);
    let base_value = base.value_for_shares(base_coin.value());
    let shares = shares_for_deposit(nav_before, supply, base_value);
    assert!(shares > 0, EZeroShares);

    strategy.base_shares.join(base_coin.into_balance());
    let minted = coin::mint(&mut strategy.treasury, shares, ctx);

    event::emit(StrategyDeposited {
        strategy_id: strategy.id.to_inner(),
        depositor: ctx.sender(),
        amount,
        shares_minted: shares,
        nav_before,
    });

    minted
}

/// Instant exit, only between rounds: burn shares and release their pro-rata
/// slice of deployable base shares, redeemed for quote through the base vault.
public fun withdraw<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    shares: Coin<BUP>,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert_base_vault(strategy, base);
    assert!(option::is_none(&strategy.active_round), ERoundAlreadyActive);
    let share_amount = shares.value();
    assert!(share_amount > 0, EZeroShares);

    let nav_before = strategy.nav(base);
    let supply = strategy.share_supply();
    let base_share_amount = amount_for_shares(strategy.base_shares.value(), supply, share_amount);
    assert!(base_share_amount > 0, EZeroShares);

    coin::burn(&mut strategy.treasury, shares);
    let base_coin = strategy.base_shares.split(base_share_amount).into_coin(ctx);
    let out = base_vault::withdraw(base, base_coin, ctx);
    let amount_out = out.value();

    event::emit(StrategyWithdrawn {
        strategy_id: strategy.id.to_inner(),
        owner: ctx.sender(),
        shares_burned: share_amount,
        amount_out,
        nav_before,
    });

    out
}

/// Queue an exit during a live round. Escrows the caller's BUP shares; they are
/// priced and burned at the round's settlement, then claimable as quote.
public fun request_withdraw<Quote>(
    strategy: &mut Strategy<Quote>,
    shares: Coin<BUP>,
    ctx: &mut TxContext,
) {
    assert!(option::is_some(&strategy.active_round), ENoActiveRound);
    let share_amount = shares.value();
    assert!(share_amount > 0, EZeroShares);

    let owner = ctx.sender();
    let round = strategy.queue.current_round();
    strategy.pending_shares.join(shares.into_balance());
    strategy.queue.request(owner, share_amount);

    event::emit(WithdrawalRequested {
        strategy_id: strategy.id.to_inner(),
        owner,
        round,
        shares: share_amount,
    });
}

/// Back out an open request before its round settles; returns the escrowed BUP
/// shares.
public fun cancel_request<Quote>(
    strategy: &mut Strategy<Quote>,
    ctx: &mut TxContext,
): Coin<BUP> {
    let owner = ctx.sender();
    let share_amount = strategy.queue.cancel(owner);
    let refund = strategy.pending_shares.split(share_amount).into_coin(ctx);

    event::emit(WithdrawalCancelled {
        strategy_id: strategy.id.to_inner(),
        owner,
        shares: share_amount,
    });

    refund
}

/// Claim a settled request: pull the reserved base shares set aside at
/// settlement and redeem them for quote through the base vault.
public fun claim_withdrawal<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    ctx: &mut TxContext,
): Coin<Quote> {
    assert_base_vault(strategy, base);
    let owner = ctx.sender();
    let base_share_amount = strategy.queue.claim(owner);
    let base_coin = strategy.reserved_base_shares.split(base_share_amount).into_coin(ctx);
    let out = base_vault::withdraw(base, base_coin, ctx);
    let amount_out = out.value();

    event::emit(WithdrawalClaimed {
        strategy_id: strategy.id.to_inner(),
        owner,
        base_shares: base_share_amount,
        amount_out,
    });

    out
}

/// Permissionlessly roll back an abandoned, settled request after the grace
/// period: the reserved base shares return to deployable capital and the user is
/// re-issued fresh BUP shares at the current NAV for that value.
public fun sweep_stale_withdrawal<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &BaseVault<Quote>,
    user: address,
    ctx: &mut TxContext,
) {
    assert_base_vault(strategy, base);
    let base_share_amount = strategy.queue.sweep_stale(user, strategy.stale_withdrawal_grace_rounds);

    let nav_before = strategy.nav(base);
    let supply = strategy.share_supply();
    let reclaimed_value = base.value_for_shares(base_share_amount);
    let shares = shares_for_deposit(nav_before, supply, reclaimed_value);
    assert!(shares > 0, EZeroShares);

    strategy.base_shares.join(strategy.reserved_base_shares.split(base_share_amount));
    let reissued = coin::mint(&mut strategy.treasury, shares, ctx);
    transfer::public_transfer(reissued, user);

    event::emit(WithdrawalSwept {
        strategy_id: strategy.id.to_inner(),
        owner: user,
        base_shares: base_share_amount,
        shares_reissued: shares,
    });
}

/// Open the round's single UP-binary position. Keeper-only, paused-gated, and
/// only valid with no active round. Pulls all deployable capital into a transient
/// coin, sizes the premium and reserve from policy, funds the dedicated manager,
/// mints `quantity` UP units at or below the policy ask ceiling, then redeposits
/// every unspent unit back to base shares before recording the round.
public fun start_round<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    cap: &StrategyKeeperCap,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    strike: u64,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!strategy.paused, EPaused);
    assert_base_vault(strategy, base);
    assert_strategy_keeper_cap(strategy, cap);
    assert!(option::is_none(&strategy.active_round), ERoundAlreadyActive);
    assert!(object::id(manager) == strategy.manager_id, EWrongManager);
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    assert!(manager.balance<Quote>() == 0, EManagerNotDedicated);
    assert!(oracle.status(clock) == oracle::status_active(), EOracleNotActive);
    assert!(quantity > 0, EZeroQuantity);
    assert_valid_upside_strike(&strategy.policy, oracle, strike);

    // Pull all deployable capital into a transient local coin.
    let mut funds = redeem_base_shares(strategy, base, ctx);
    let nav_now = funds.value();
    assert!(nav_now > 0, EZeroDeposit);

    let premium_budget_amount = bps_amount(nav_now, policy::premium_budget_bps(&strategy.policy));
    let reserve_amount = bps_amount(nav_now, policy::reserve_bps(&strategy.policy));
    assert!(premium_budget_amount > 0, EInvalidPremiumBudget);
    assert!(nav_now >= premium_budget_amount + reserve_amount, ECashLow);

    let key = market_key::new(oracle.id(), oracle.expiry(), strike, true);
    assert_position(manager, key, 0);
    let (ask_cost, bid_cost) = predict.get_trade_amounts(oracle, key, quantity, clock);
    assert_up_ask_within_ceiling(&strategy.policy, ask_cost, quantity);

    let premium_coin = funds.split(premium_budget_amount, ctx);
    manager.deposit<Quote>(premium_coin, ctx);
    let manager_balance_after_deposit = manager.balance<Quote>();

    predict.mint<Quote>(manager, oracle, key, quantity, clock, ctx);
    let manager_balance_after_mint = manager.balance<Quote>();
    assert!(manager_balance_after_mint <= manager_balance_after_deposit, EExceededPremiumBudget);
    let premium_spent = manager_balance_after_deposit - manager_balance_after_mint;
    assert!(premium_spent <= premium_budget_amount, EExceededPremiumBudget);
    assert_up_ask_within_ceiling(&strategy.policy, premium_spent, quantity);

    // Reclaim any unspent premium and redeposit everything to base shares.
    let refund_amount = manager_balance_after_mint;
    if (refund_amount > 0) {
        funds.join(manager.withdraw<Quote>(refund_amount, ctx));
    };
    deposit_funds_to_base_shares(strategy, base, funds, ctx);

    strategy.active_round = option::some(Round {
        predict_id: object::id(predict),
        oracle_id: oracle.id(),
        strike,
        quantity,
    });

    event::emit(RoundStarted {
        strategy_id: strategy.id.to_inner(),
        predict_id: object::id(predict),
        manager_id: strategy.manager_id,
        oracle_id: oracle.id(),
        premium_budget_amount,
        premium_spent,
        refund_amount,
        reserve_amount,
        ask_cost,
        bid_cost,
    });
}

/// Close the round in one phase: redeem the position, return all value to base
/// shares, settle the withdrawal queue against that base-share total, and clear
/// the active round.
public fun settle_round<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    cap: &StrategyKeeperCap,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_base_vault(strategy, base);
    assert_strategy_keeper_cap(strategy, cap);
    assert!(option::is_some(&strategy.active_round), ENoActiveRound);
    assert!(object::id(manager) == strategy.manager_id, EWrongManager);
    assert!(manager.owner() == ctx.sender(), ENotManagerOwner);
    assert!(oracle.is_settled(), EOracleNotSettled);

    let round = option::extract(&mut strategy.active_round);
    assert!(object::id(predict) == round.predict_id, EWrongPredict);
    assert!(oracle.id() == round.oracle_id, EWrongOracle);

    let key = market_key::new(round.oracle_id, oracle.expiry(), round.strike, true);
    let expected_payout = settled_payout(&round, oracle);
    redeem_or_assert_swept<Quote>(predict, manager, oracle, key, round.quantity, expected_payout, clock, ctx);

    // Pull all proceeds out of the manager and back into deployable base shares.
    let manager_balance_swept = manager.balance<Quote>();
    if (manager_balance_swept > 0) {
        let proceeds = manager.withdraw<Quote>(manager_balance_swept, ctx);
        deposit_funds_to_base_shares(strategy, base, proceeds, ctx);
    };

    // Queue settlement: all value is now in `base_shares`. Reserve a pro-rata
    // slice for this round's requests (priced against the full supply, which
    // still includes the escrowed pending shares), move it out of deployable
    // capital, advance the round, and burn the entire escrow.
    let settle_round = strategy.queue.current_round();
    let pending = strategy.queue.pending_shares(settle_round);
    let supply = strategy.share_supply();
    let deployable = strategy.base_shares.value();
    let reserved = if (pending > 0 && supply > 0) {
        ((deployable as u128) * (pending as u128) / (supply as u128)) as u64
    } else {
        0
    };
    if (reserved > 0) {
        strategy.reserved_base_shares.join(strategy.base_shares.split(reserved));
    };
    let burned = strategy.queue.settle(reserved);
    if (burned > 0) {
        let escrow = strategy.pending_shares.withdraw_all().into_coin(ctx);
        coin::burn(&mut strategy.treasury, escrow);
    };

    event::emit(RoundSettled {
        strategy_id: strategy.id.to_inner(),
        predict_id: round.predict_id,
        manager_id: strategy.manager_id,
        oracle_id: round.oracle_id,
        round: settle_round,
        manager_balance_swept,
        reserved_base_shares: reserved,
        shares_burned: burned,
        nav_after_settle: strategy.nav(base),
    });
}

/// Toggle the emergency pause (admin-only). Blocks deposit and start_round.
public fun set_paused<Quote>(strategy: &mut Strategy<Quote>, cap: &StrategyAdminCap, paused: bool) {
    assert_strategy_admin_cap(strategy, cap);
    strategy.paused = paused;
}

/// Replace the trading policy (admin-only). Takes effect on the next round.
public fun set_policy<Quote>(strategy: &mut Strategy<Quote>, cap: &StrategyAdminCap, policy: Policy) {
    assert_strategy_admin_cap(strategy, cap);
    strategy.policy = policy;
}

/// Set the stale-sweep grace period in rounds (admin-only); must be non-zero.
public fun set_stale_grace<Quote>(strategy: &mut Strategy<Quote>, cap: &StrategyAdminCap, rounds: u64) {
    assert_strategy_admin_cap(strategy, cap);
    assert!(rounds > 0, EZeroGraceRounds);
    strategy.stale_withdrawal_grace_rounds = rounds;
}

/// BUP shares minted for a deposit of `amount` quote-value into a strategy at
/// `nav_before` / `supply`. First deposit mints 1:1; thereafter pro-rata, with
/// integer division rounding in the strategy's favor.
public fun shares_for_deposit(nav_before: u64, supply: u64, amount: u64): u64 {
    if (supply == 0 || nav_before == 0) {
        amount
    } else {
        ((amount as u128) * (supply as u128) / (nav_before as u128)) as u64
    }
}

/// Quote-equivalent value owed for burning `shares` against a strategy at
/// `nav_now` / `supply`. Rounds in the strategy's favor.
public fun amount_for_shares(nav_now: u64, supply: u64, shares: u64): u64 {
    assert!(supply > 0, EZeroShares);
    ((shares as u128) * (nav_now as u128) / (supply as u128)) as u64
}

public fun id<Quote>(strategy: &Strategy<Quote>): ID { strategy.id.to_inner() }

public fun manager_id<Quote>(strategy: &Strategy<Quote>): ID { strategy.manager_id }

public fun paused<Quote>(strategy: &Strategy<Quote>): bool { strategy.paused }

public fun has_active_round<Quote>(strategy: &Strategy<Quote>): bool { option::is_some(&strategy.active_round) }

public fun active_round<Quote>(strategy: &Strategy<Quote>): Option<Round> { strategy.active_round }

public fun policy<Quote>(strategy: &Strategy<Quote>): Policy { strategy.policy }

/// NAV is the live quote value of the deployable base shares only; reserved base
/// shares (owed to the queue) are excluded.
public fun nav<Quote>(strategy: &Strategy<Quote>, base: &BaseVault<Quote>): u64 {
    let base_share_amount = strategy.base_shares.value();
    if (base_share_amount == 0) { 0 } else { base.value_for_shares(base_share_amount) }
}

public fun share_supply<Quote>(strategy: &Strategy<Quote>): u64 { strategy.treasury.total_supply() }

public fun base_vault_id<Quote>(strategy: &Strategy<Quote>): ID { strategy.base_vault_id }

public fun base_shares_amount<Quote>(strategy: &Strategy<Quote>): u64 { strategy.base_shares.value() }

public fun reserved_base_shares_amount<Quote>(strategy: &Strategy<Quote>): u64 {
    strategy.reserved_base_shares.value()
}

public fun pending_shares_amount<Quote>(strategy: &Strategy<Quote>): u64 { strategy.pending_shares.value() }

public fun stale_withdrawal_grace_rounds<Quote>(strategy: &Strategy<Quote>): u64 {
    strategy.stale_withdrawal_grace_rounds
}

public fun current_round<Quote>(strategy: &Strategy<Quote>): u64 { strategy.queue.current_round() }

public fun has_withdrawal_request<Quote>(strategy: &Strategy<Quote>, user: address): bool {
    strategy.queue.has_request(user)
}

public fun withdrawal_request_shares<Quote>(strategy: &Strategy<Quote>, user: address): u64 {
    strategy.queue.request_shares(user)
}

public fun withdrawal_request_settled<Quote>(strategy: &Strategy<Quote>, user: address): bool {
    strategy.queue.is_settled(user)
}

public fun admin_cap_id(cap: &StrategyAdminCap): ID { cap.id.to_inner() }

public fun admin_cap_strategy_id(cap: &StrategyAdminCap): ID { cap.strategy_id }

public fun keeper_cap_id(cap: &StrategyKeeperCap): ID { cap.id.to_inner() }

public fun keeper_cap_strategy_id(cap: &StrategyKeeperCap): ID { cap.strategy_id }

public fun round_predict_id(round: &Round): ID { round.predict_id }

public fun round_oracle_id(round: &Round): ID { round.oracle_id }

public fun round_strike(round: &Round): u64 { round.strike }

public fun round_quantity(round: &Round): u64 { round.quantity }

public(package) fun assert_strategy_admin_cap<Quote>(strategy: &Strategy<Quote>, cap: &StrategyAdminCap) {
    assert!(cap.strategy_id == strategy.id.to_inner(), EWrongStrategyAdminCap);
}

public(package) fun assert_strategy_keeper_cap<Quote>(strategy: &Strategy<Quote>, cap: &StrategyKeeperCap) {
    assert!(cap.strategy_id == strategy.id.to_inner(), EWrongStrategyKeeperCap);
}

fun assert_base_vault<Quote>(strategy: &Strategy<Quote>, base: &BaseVault<Quote>) {
    assert!(base.id() == strategy.base_vault_id, EWrongBaseVault);
}

/// Redeem all deployable base shares into a transient local quote coin.
fun redeem_base_shares<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    ctx: &mut TxContext,
): Coin<Quote> {
    if (strategy.base_shares.value() == 0) {
        coin::zero(ctx)
    } else {
        let base_coin = strategy.base_shares.withdraw_all().into_coin(ctx);
        base_vault::withdraw(base, base_coin, ctx)
    }
}

/// Deposit a transient local quote coin back into deployable base shares.
fun deposit_funds_to_base_shares<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    funds: Coin<Quote>,
    ctx: &mut TxContext,
) {
    if (funds.value() == 0) {
        funds.destroy_zero();
    } else {
        let base_coin = base_vault::deposit(base, funds, ctx);
        strategy.base_shares.join(base_coin.into_balance());
    }
}

// A valid upside strike sits strictly above spot and no further than the policy
// band above it: spot < strike <= spot + band_bps * spot.
fun assert_valid_upside_strike(strategy_policy: &Policy, oracle: &OracleSVI, strike: u64) {
    let spot = oracle.spot_price();
    let band_ceiling = (spot as u128) + (bps_amount(spot, policy::strike_band_bps(strategy_policy)) as u128);
    assert!((strike as u128) > (spot as u128) && (strike as u128) <= band_ceiling, EInvalidUpsideStrike);
}

// The per-unit ask must not exceed the policy ceiling. Cross-multiplied to avoid
// division: ask_cost / quantity <= max_up_ask_bps / BPS_DENOMINATOR.
fun assert_up_ask_within_ceiling(strategy_policy: &Policy, ask_cost: u64, quantity: u64) {
    assert!((ask_cost as u128) * (BPS_DENOMINATOR as u128) <= (quantity as u128) * (policy::max_up_ask_bps(strategy_policy) as u128), EUpAskAboveCeiling);
}

fun assert_position(manager: &PredictManager, key: MarketKey, expected_quantity: u64) {
    assert!(manager.position(key) == expected_quantity, EPositionChanged);
}

// Close the round's position and prove the settled payout is present. If any
// units remain, redeem up to the round's quantity and require the manager
// balance to grow by at least the expected per-unit payout; whether or not the
// position was already swept permissionlessly, require the full expected payout
// to be sitting in the manager.
fun redeem_or_assert_swept<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    expected_payout: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let remaining = manager.position(key);
    if (remaining > 0) {
        let redeem_quantity = if (remaining > quantity) { quantity } else { remaining };
        let redeem_expected_payout = proportional_payout(expected_payout, redeem_quantity, quantity);
        let manager_balance_before_redeem = manager.balance<Quote>();
        predict.redeem_permissionless<Quote>(manager, oracle, key, redeem_quantity, clock, ctx);
        let manager_balance_after_redeem = manager.balance<Quote>();
        assert!((manager_balance_after_redeem as u128) >= (manager_balance_before_redeem as u128) + (redeem_expected_payout as u128), ESettledPayoutMissing);
    };
    assert!(manager.balance<Quote>() >= expected_payout, ESettledPayoutMissing);
}

// An UP binary pays one unit of quote per unit held iff settlement is strictly
// above the strike; otherwise it expires worthless.
fun settled_payout(round: &Round, oracle: &OracleSVI): u64 {
    let settlement = option::destroy_some(oracle.settlement_price());
    if (settlement > round.strike) {
        round.quantity
    } else {
        0
    }
}

fun bps_amount(amount: u64, bps: u16): u64 {
    ((amount as u128) * (bps as u128) / (BPS_DENOMINATOR as u128)) as u64
}

fun proportional_payout(total_payout: u64, redeem_quantity: u64, total_quantity: u64): u64 {
    ((total_payout as u128) * (redeem_quantity as u128) / (total_quantity as u128)) as u64
}

#[test_only]
public fun set_active_round_predict_id_for_testing<Quote>(strategy: &mut Strategy<Quote>, predict_id: ID) {
    let round = option::borrow_mut(&mut strategy.active_round);
    round.predict_id = predict_id;
}

#[test_only]
public fun destroy_admin_cap_for_testing(cap: StrategyAdminCap) {
    let StrategyAdminCap { id, strategy_id: _ } = cap;
    id.delete();
}

#[test_only]
public fun destroy_keeper_cap_for_testing(cap: StrategyKeeperCap) {
    let StrategyKeeperCap { id, strategy_id: _ } = cap;
    id.delete();
}
