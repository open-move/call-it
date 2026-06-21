/// Managed PLP-collar strategy backed by the CallIt Base Vault.
///
/// The strategy holds NO bare cash. Idle/reserve capital lives in the shared
/// Base Vault as `base_shares`; quote only ever exists as a transient local
/// `Coin<Quote>` inside a single function (redeem -> trade/supply/settle ->
/// redeposit). Each round the strategy buys a downside + upside hedge pair and
/// allocates the remainder above reserve into PLP; both the hedges and the PLP
/// are unwound in `settle_round`.
///
/// Deposits and instant withdrawals are only allowed between rounds. While a
/// round is live, holders exit through the withdrawal queue: `request_withdraw`
/// escrows their PCOLLAR shares, `settle_round` snapshots a pro-rata slice of
/// base shares into `reserved_base_shares` and burns the escrow, and
/// `claim_withdrawal` pulls quote at the settled price. `cancel_request` backs
/// out before settlement; `sweep_stale_withdrawal` rolls an abandoned request
/// back into the strategy after a disclosed grace period.
module plp_collar_strategy::strategy;

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
use deepbook_predict::{
    market_key::{Self, MarketKey},
    oracle::{Self, OracleSVI},
    plp::PLP,
    predict::{Predict},
    predict_manager::PredictManager,
};
use plp_collar_strategy::pcollar::PCOLLAR;
use plp_collar_strategy::policy::{Self, Policy};

/// Basis-point scale: 10_000 bps == 100%.
const BPS_DENOMINATOR: u64 = 10_000;
/// Default rounds a settled request must age before it may be swept as stale.
const DEFAULT_STALE_GRACE_ROUNDS: u64 = 4;

#[error]
const EPaused: vector<u8> = b"Strategy is paused";

#[error]
const EWrongStrategyAdminCap: vector<u8> = b"Admin cap does not authorize this strategy";

#[error]
const ERoundAlreadyActive: vector<u8> = b"A round is already active";

#[error]
const ENoActiveRound: vector<u8> = b"No round is currently active";

#[error]
const EWrongManager: vector<u8> = b"Manager is not the strategy's dedicated manager";

#[error]
const ENotManagerOwner: vector<u8> = b"Caller does not own the manager";

#[error]
const EManagerNotDedicated: vector<u8> = b"Manager must hold no quote balance before a round";

#[error]
const EOracleNotActive: vector<u8> = b"Oracle is not active";

#[error]
const EOracleNotSettled: vector<u8> = b"Oracle has not settled yet";

#[error]
const EWrongPredict: vector<u8> = b"Predict object does not match the active round";

#[error]
const EWrongOracle: vector<u8> = b"Oracle does not match the active round";

#[error]
const EInvalidPremiumBudget: vector<u8> = b"Combined premium budget must be non-zero";

#[error]
const ECashLow: vector<u8> = b"NAV is insufficient to cover premium budget plus reserve";

#[error]
const EZeroDeposit: vector<u8> = b"Amount must resolve to a non-zero quote value";

#[error]
const EZeroShares: vector<u8> = b"Share amount must be non-zero";

#[error]
const ELegAskAboveCeiling: vector<u8> = b"Leg ask cost exceeds the policy ceiling";

#[error]
const EExceededPremiumBudget: vector<u8> = b"Premium spent exceeds the budget";

#[error]
const EPositionChanged: vector<u8> = b"Manager position is not at the expected quantity";

#[error]
const ESettledPayoutMissing: vector<u8> = b"Settled payout is below the expected amount";

#[error]
const EInvalidStrike: vector<u8> = b"Strikes are not within policy bounds around spot";

#[error]
const EZeroQuantity: vector<u8> = b"Leg quantity must be non-zero";

#[error]
const EWrongBaseVault: vector<u8> = b"Base vault does not match the strategy";

#[error]
const EWrongStrategyKeeperCap: vector<u8> = b"Keeper cap does not authorize this strategy";

#[error]
const EZeroGraceRounds: vector<u8> = b"Stale grace rounds must be non-zero";

#[error]
const EInvalidPlpAllocation: vector<u8> = b"PLP allocation must be non-zero";

/// Snapshot of the live round's hedge pair: the Predict/oracle it was opened
/// against and the strike + quantity of each (down/up) collar leg. Held in
/// `active_round` between `start_round` and `settle_round`.
public struct Round has copy, drop, store {
    predict_id: ID,
    oracle_id: ID,
    /// Strike of the downside (put-like) hedge leg.
    down_strike: u64,
    /// Strike of the upside (call-like) hedge leg.
    up_strike: u64,
    /// Quantity minted on the downside leg.
    down_quantity: u64,
    /// Quantity minted on the upside leg.
    up_quantity: u64,
}

/// The shared strategy object. Holds no bare cash — all capital lives as base
/// vault shares or, during a round, as transient hedge/PLP positions.
public struct Strategy<phantom Quote> has key {
    id: UID,
    /// Mints PCOLLAR on deposit, burns on withdraw; total supply == circulating shares.
    treasury: TreasuryCap<PCOLLAR>,
    /// The base vault this strategy parks its reserve in; checked on every call.
    base_vault_id: ID,
    /// Deployable base-vault shares; counted in NAV.
    base_shares: Balance<BASE_VAULT>,
    /// Base-vault shares owed to settled withdrawal requests; never deployed and
    /// NOT counted in NAV.
    reserved_base_shares: Balance<BASE_VAULT>,
    /// PLP liquidity held for the duration of a round; unwound at settlement.
    plp: Balance<PLP>,
    /// Quote committed to PLP this round; recorded for the round event only.
    plp_cost_basis: u64,
    /// Per-strategy withdrawal-request bookkeeping (share units only, no coins).
    queue: WithdrawalQueue,
    /// PCOLLAR share coins escrowed for open withdrawal requests.
    pending_shares: Balance<PCOLLAR>,
    manager_id: ID,
    active_round: Option<Round>,
    policy: Policy,
    /// Rounds after a request's settlement before anyone may sweep it as stale.
    stale_withdrawal_grace_rounds: u64,
    paused: bool,
}

/// Admin capability bound to a strategy: pause, policy, and grace-period control.
public struct StrategyAdminCap has key, store { id: UID, strategy_id: ID }

/// Keeper capability bound to a strategy: starting and settling rounds.
public struct StrategyKeeperCap has key, store { id: UID, strategy_id: ID }

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
    downside_budget_amount: u64,
    upside_budget_amount: u64,
    premium_spent: u64,
    refund_amount: u64,
    reserve_amount: u64,
    plp_cost_basis: u64,
    plp_shares: u64,
}

public struct RoundSettled has copy, drop {
    strategy_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    round: u64,
    manager_balance_swept: u64,
    plp_realized: u64,
    reserved_base_shares: u64,
    shares_burned: u64,
    nav_after_settle: u64,
}

/// Bootstrap a strategy bound to a base vault and a dedicated Predict manager.
/// The caller must own `manager`. Returns the strategy plus its admin and keeper
/// caps; the strategy must be shared via `share_strategy` before use.
public fun create_strategy<Quote>(
    treasury: TreasuryCap<PCOLLAR>,
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
        plp: balance::zero(),
        plp_cost_basis: 0,
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

public fun share_strategy<Quote>(strategy: Strategy<Quote>) { transfer::share_object(strategy); }

/// Deposit `funds` between rounds and receive NAV-proportional PCOLLAR shares.
/// The quote is immediately parked in the base vault as deployable base shares;
/// shares are priced against NAV before the deposit so holders are not diluted.
public fun deposit<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    funds: Coin<Quote>,
    ctx: &mut TxContext,
): Coin<PCOLLAR> {
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
    shares: Coin<PCOLLAR>,
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

/// Queue an exit during a live round. Escrows the caller's PCOLLAR shares; they
/// are priced and burned at the round's settlement, then claimable as quote.
public fun request_withdraw<Quote>(
    strategy: &mut Strategy<Quote>,
    shares: Coin<PCOLLAR>,
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

/// Back out an open request before its round settles; returns the escrowed
/// PCOLLAR shares.
public fun cancel_request<Quote>(
    strategy: &mut Strategy<Quote>,
    ctx: &mut TxContext,
): Coin<PCOLLAR> {
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
/// re-issued fresh PCOLLAR shares at the current NAV for that value.
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

/// Open a round (keeper only). Redeems all deployable base shares into a
/// transient coin, spends the policy premium budget on a downside + upside hedge
/// pair through the dedicated manager, allocates the remainder above reserve into
/// PLP (capped by policy), parks any leftover back as base shares, and records
/// the `Round`. No bare cash survives the call.
public fun start_round<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    cap: &StrategyKeeperCap,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    down_strike: u64,
    down_quantity: u64,
    up_strike: u64,
    up_quantity: u64,
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
    assert!(down_quantity > 0 && up_quantity > 0, EZeroQuantity);
    assert_valid_strikes(&strategy.policy, oracle, down_strike, up_strike);

    // Pull all deployable capital into a transient local coin.
    let mut funds = redeem_base_shares(strategy, base, ctx);
    let nav_now = funds.value();
    assert!(nav_now > 0, EZeroDeposit);

    let downside_budget_amount = bps_amount(nav_now, policy::downside_budget_bps(&strategy.policy));
    let upside_budget_amount = bps_amount(nav_now, policy::upside_budget_bps(&strategy.policy));
    let reserve_amount = bps_amount(nav_now, policy::reserve_bps(&strategy.policy));
    let max_plp_cost_basis = bps_amount(nav_now, policy::max_plp_allocation_bps(&strategy.policy));
    let premium_budget_amount = downside_budget_amount + upside_budget_amount;
    assert!(premium_budget_amount > 0, EInvalidPremiumBudget);
    assert!(nav_now >= premium_budget_amount + reserve_amount, ECashLow);

    let down_key = market_key::new(oracle.id(), oracle.expiry(), down_strike, false);
    let up_key = market_key::new(oracle.id(), oracle.expiry(), up_strike, true);
    assert_position(manager, down_key, 0);
    assert_position(manager, up_key, 0);
    let (down_ask_cost, _) = predict.get_trade_amounts(oracle, down_key, down_quantity, clock);
    let (up_ask_cost, _) = predict.get_trade_amounts(oracle, up_key, up_quantity, clock);
    assert_leg_ask_within_ceiling(&strategy.policy, down_ask_cost, down_quantity);
    assert_leg_ask_within_ceiling(&strategy.policy, up_ask_cost, up_quantity);

    // Fund the hedge legs out of the transient coin.
    let premium_coin = funds.split(premium_budget_amount, ctx);
    manager.deposit<Quote>(premium_coin, ctx);
    let manager_balance_after_deposit = manager.balance<Quote>();
    mint_leg<Quote>(predict, manager, oracle, down_key, down_quantity, clock, ctx, &strategy.policy);
    mint_leg<Quote>(predict, manager, oracle, up_key, up_quantity, clock, ctx, &strategy.policy);
    let manager_balance_after_mint = manager.balance<Quote>();
    let premium_spent = manager_balance_after_deposit - manager_balance_after_mint;
    assert!(premium_spent <= premium_budget_amount, EExceededPremiumBudget);

    // Reclaim any unspent premium back into the transient coin.
    let refund_amount = manager_balance_after_mint;
    if (refund_amount > 0) {
        funds.join(manager.withdraw<Quote>(refund_amount, ctx));
    };

    // Allocate everything above the reserve (capped by policy) into PLP.
    let funds_after_hedges = funds.value();
    let deployable_above_reserve = if (funds_after_hedges > reserve_amount) {
        funds_after_hedges - reserve_amount
    } else {
        0
    };
    let plp_cost_basis = if (deployable_above_reserve > max_plp_cost_basis) {
        max_plp_cost_basis
    } else {
        deployable_above_reserve
    };
    assert!(plp_cost_basis > 0, EInvalidPlpAllocation);
    let plp_coin = predict.supply<Quote>(funds.split(plp_cost_basis, ctx), clock, ctx);
    let plp_shares = plp_coin.value();
    strategy.plp.join(plp_coin.into_balance());
    strategy.plp_cost_basis = plp_cost_basis;

    // Park the remainder back in deployable base shares.
    deposit_funds_to_base_shares(strategy, base, funds, ctx);

    strategy.active_round = option::some(Round {
        predict_id: object::id(predict),
        oracle_id: oracle.id(),
        down_strike,
        up_strike,
        down_quantity,
        up_quantity,
    });

    event::emit(RoundStarted {
        strategy_id: strategy.id.to_inner(),
        predict_id: object::id(predict),
        manager_id: strategy.manager_id,
        oracle_id: oracle.id(),
        downside_budget_amount,
        upside_budget_amount,
        premium_spent,
        refund_amount,
        reserve_amount,
        plp_cost_basis,
        plp_shares,
    });
}

/// Close the round in one phase: redeem hedge positions, unwind PLP, return all
/// value to base shares, settle the withdrawal queue against that base-share
/// total, and clear the active round.
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

    let down_key = market_key::new(round.oracle_id, oracle.expiry(), round.down_strike, false);
    let up_key = market_key::new(round.oracle_id, oracle.expiry(), round.up_strike, true);
    let down_payout = settled_down_payout(&round, oracle);
    let up_payout = settled_up_payout(&round, oracle);
    redeem_or_assert_swept<Quote>(predict, manager, oracle, down_key, round.down_quantity, down_payout, clock, ctx);
    redeem_or_assert_swept<Quote>(predict, manager, oracle, up_key, round.up_quantity, up_payout, clock, ctx);

    // Pull all proceeds out of the manager and unwind PLP into a transient coin.
    let mut funds = coin::zero<Quote>(ctx);
    let manager_balance_swept = manager.balance<Quote>();
    if (manager_balance_swept > 0) {
        funds.join(manager.withdraw<Quote>(manager_balance_swept, ctx));
    };
    let mut plp_realized = 0;
    if (strategy.plp.value() > 0) {
        let quote_out = predict.withdraw<Quote>(strategy.plp.withdraw_all().into_coin(ctx), clock, ctx);
        plp_realized = quote_out.value();
        funds.join(quote_out);
    };
    strategy.plp_cost_basis = 0;
    deposit_funds_to_base_shares(strategy, base, funds, ctx);

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
        plp_realized,
        reserved_base_shares: reserved,
        shares_burned: burned,
        nav_after_settle: strategy.nav(base),
    });
}

public fun set_paused<Quote>(strategy: &mut Strategy<Quote>, cap: &StrategyAdminCap, paused: bool) {
    assert_strategy_admin_cap(strategy, cap);
    strategy.paused = paused;
}

public fun set_policy<Quote>(strategy: &mut Strategy<Quote>, cap: &StrategyAdminCap, policy: Policy) {
    assert_strategy_admin_cap(strategy, cap);
    strategy.policy = policy;
}

public fun set_stale_grace<Quote>(strategy: &mut Strategy<Quote>, cap: &StrategyAdminCap, rounds: u64) {
    assert_strategy_admin_cap(strategy, cap);
    assert!(rounds > 0, EZeroGraceRounds);
    strategy.stale_withdrawal_grace_rounds = rounds;
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

public fun plp_amount<Quote>(strategy: &Strategy<Quote>): u64 { strategy.plp.value() }

public fun plp_cost_basis<Quote>(strategy: &Strategy<Quote>): u64 { strategy.plp_cost_basis }

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

public fun round_down_strike(round: &Round): u64 { round.down_strike }

public fun round_up_strike(round: &Round): u64 { round.up_strike }

public fun round_down_quantity(round: &Round): u64 { round.down_quantity }

public fun round_up_quantity(round: &Round): u64 { round.up_quantity }

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

// The collar must straddle spot: the down strike sits below spot, the up strike
// above it, and they may not cross. Each strike must also lie within the policy
// band of spot (down no more than `band` below, up no more than `band` above), so
// the legs stay close enough to spot to be meaningful hedges.
fun assert_valid_strikes(strategy_policy: &Policy, oracle: &OracleSVI, down_strike: u64, up_strike: u64) {
    let spot = oracle.spot_price();
    let band = bps_amount(spot, policy::strike_band_bps(strategy_policy));
    let spot_u128 = spot as u128;
    let band_u128 = band as u128;
    assert!((down_strike as u128) < spot_u128 && (up_strike as u128) > spot_u128 && down_strike < up_strike, EInvalidStrike);
    assert!((down_strike as u128) + band_u128 >= spot_u128 && (up_strike as u128) <= spot_u128 + band_u128, EInvalidStrike);
}

// Reject a leg whose ask cost per unit exceeds the policy ceiling. Cross-multiply
// to avoid division: ask/quantity <= max_leg_ask_bps/BPS_DENOMINATOR.
fun assert_leg_ask_within_ceiling(strategy_policy: &Policy, ask_cost: u64, quantity: u64) {
    assert!((ask_cost as u128) * (BPS_DENOMINATOR as u128) <= (quantity as u128) * (policy::max_leg_ask_bps(strategy_policy) as u128), ELegAskAboveCeiling);
}

fun assert_position(manager: &PredictManager, key: MarketKey, expected_quantity: u64) {
    assert!(manager.position(key) == expected_quantity, EPositionChanged);
}

fun mint_leg<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
    strategy_policy: &Policy,
) {
    let balance_before = manager.balance<Quote>();
    predict.mint<Quote>(manager, oracle, key, quantity, clock, ctx);
    let balance_after = manager.balance<Quote>();
    assert!(balance_after <= balance_before, EExceededPremiumBudget);
    assert_leg_ask_within_ceiling(strategy_policy, balance_before - balance_after, quantity);
}

// Redeem a settled leg, or assert it was already swept by someone else. If the
// position is still open we redeem up to `quantity` and require the manager
// balance to grow by at least the proportional expected payout; either way, the
// manager must end up holding at least the full `expected_payout` for the leg.
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
        let before = manager.balance<Quote>();
        predict.redeem_permissionless<Quote>(manager, oracle, key, redeem_quantity, clock, ctx);
        let after = manager.balance<Quote>();
        assert!((after as u128) >= (before as u128) + (redeem_expected_payout as u128), ESettledPayoutMissing);
    };
    assert!(manager.balance<Quote>() >= expected_payout, ESettledPayoutMissing);
}

// Downside leg pays one unit per quantity when settlement lands at or below its
// strike (the market fell), otherwise nothing.
fun settled_down_payout(round: &Round, oracle: &OracleSVI): u64 {
    let settlement = option::destroy_some(oracle.settlement_price());
    if (settlement <= round.down_strike) { round.down_quantity } else { 0 }
}

// Upside leg pays one unit per quantity when settlement lands strictly above its
// strike (the market rose), otherwise nothing.
fun settled_up_payout(round: &Round, oracle: &OracleSVI): u64 {
    let settlement = option::destroy_some(oracle.settlement_price());
    if (settlement > round.up_strike) { round.up_quantity } else { 0 }
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
