/// Managed Range Ladder strategy using true DeepBook Predict RangeKey positions,
/// backed by the CallIt Base Vault.
///
/// The strategy holds NO bare cash. Idle/reserve capital lives in the shared
/// Base Vault as `base_shares`; quote only ever exists as a transient local
/// `Coin<Quote>` inside a single function (redeem -> trade/settle -> redeposit).
/// The one standing exception is `pending_deposits`: quote parked by depositors
/// who arrived mid-round, held aside and excluded from NAV until it converts to
/// shares at the next roll.
///
/// Deposits and instant withdrawals are settled between rounds. While a round is
/// live, a deposit is parked in the `deposit_queue` (priced at the next
/// settlement, refundable 1:1 until then) and holders exit through the
/// withdrawal queue: `request_withdraw`
/// escrows their RLADDER shares, `settle_round` snapshots a pro-rata slice of
/// base shares into `reserved_base_shares` and burns the escrow, and
/// `claim_withdrawal` pulls quote at the settled price. `cancel_request` backs
/// out before settlement; `sweep_stale_withdrawal` rolls an abandoned request
/// back into the strategy after a disclosed grace period.
module range_ladder_strategy::strategy;

use std::option::{Self, Option};
use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin, TreasuryCap},
    event,
    object::{Self, ID, UID},
};

use deepbook_predict::{
    oracle::{Self, OracleSVI},
    predict::{Predict},
    predict_manager::PredictManager,
    range_key::{Self, RangeKey},
};

use base_vault::{
    base_vault::{Self, BASE_VAULT, BaseVault},
    withdrawal_queue::{Self, WithdrawalQueue},
    deposit_queue::{Self, DepositQueue},
};
use range_ladder_strategy::policy::{Self, Policy, Position, Rung};
use range_ladder_strategy::rladder::RLADDER;

/// Basis-point denominator: 10_000 bps == 100%.
const BPS_DENOMINATOR: u64 = 10_000;
/// Rounds after a request settles before it may be swept as stale (default).
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
const EWrongManager: vector<u8> = b"Manager does not match the strategy's bound manager";

#[error]
const ENotManagerOwner: vector<u8> = b"Caller does not own the manager";

#[error]
const EManagerNotDedicated: vector<u8> = b"Manager must hold no quote balance before a round starts";

#[error]
const EOracleNotActive: vector<u8> = b"Oracle is not active";

#[error]
const EOracleNotSettled: vector<u8> = b"Oracle has not settled yet";

#[error]
const EWrongPredict: vector<u8> = b"Predict does not match the active round";

#[error]
const EWrongOracle: vector<u8> = b"Oracle does not match the active round";

#[error]
const EInvalidPremiumBudget: vector<u8> = b"Premium budget must resolve to a non-zero amount";

#[error]
const ECashLow: vector<u8> = b"NAV is insufficient to cover premium budget plus reserve";

#[error]
const EZeroDeposit: vector<u8> = b"Amount must resolve to a non-zero quote value";

#[error]
const EZeroShares: vector<u8> = b"Share amount must be non-zero";

#[error]
const ERangeAskAboveCeiling: vector<u8> = b"Range ask exceeds the policy's ceiling";

#[error]
const EExceededPremiumBudget: vector<u8> = b"Premium spend exceeded the budget";

#[error]
const EPositionChanged: vector<u8> = b"Range position changed since the round started";

#[error]
const EInvalidRangePayout: vector<u8> = b"Range redemption decreased the manager balance";

#[error]
const EWrongBaseVault: vector<u8> = b"Base vault does not match the strategy's bound vault";

#[error]
const EWrongStrategyKeeperCap: vector<u8> = b"Keeper cap does not authorize this strategy";

#[error]
const EZeroGraceRounds: vector<u8> = b"Grace period must be at least one round";

/// The live round's immutable record: which Predict/oracle it is bound to and
/// the exact ladder positions minted. Settlement redeems precisely these
/// positions and refuses if the Predict/oracle do not match.
public struct Round has copy, drop, store {
    predict_id: ID,
    oracle_id: ID,
    /// One entry per minted rung; redeemed one-for-one at settlement.
    positions: vector<Position>,
}

/// The shared strategy object. Holds NO bare cash — all value lives as base
/// shares (deployable or reserved) or, transiently, inside the manager during a
/// round.
public struct Strategy<phantom Quote> has key {
    id: UID,
    /// Mints `RLADDER` on deposit, burns on withdraw; supply == circulating shares.
    treasury: TreasuryCap<RLADDER>,
    /// The base vault this strategy is bound to; every call re-checks it.
    base_vault_id: ID,
    /// Deployable base-vault shares; counted in NAV.
    base_shares: Balance<BASE_VAULT>,
    /// Base-vault shares owed to settled withdrawal requests; never deployed and
    /// NOT counted in NAV.
    reserved_base_shares: Balance<BASE_VAULT>,
    /// Per-strategy withdrawal-request bookkeeping (share units only, no coins).
    queue: WithdrawalQueue,
    /// RLADDER share coins escrowed for open withdrawal requests.
    pending_shares: Balance<RLADDER>,
    /// Quote parked by deposits that arrived mid-round; held aside and NOT
    /// counted in NAV until folded into shares at the next settlement.
    pending_deposits: Balance<Quote>,
    /// RLADDER shares minted for settled pending deposits, escrowed here until
    /// each depositor claims their pro-rata slice. Already part of total supply.
    pending_share_pool: Balance<RLADDER>,
    /// Per-depositor pending-deposit bookkeeping (quote units only, no coins).
    deposit_queue: DepositQueue,
    /// The dedicated Predict manager this strategy trades through.
    manager_id: ID,
    /// `some` while a round is live; `none` between rounds.
    active_round: Option<Round>,
    /// Current risk envelope; settable by the admin between rounds.
    policy: Policy,
    /// Rounds after a request's settlement before anyone may sweep it as stale.
    stale_withdrawal_grace_rounds: u64,
    /// Circuit breaker. Blocks deposits and starting rounds while set.
    paused: bool,
}

/// Admin capability: policy, pause, and grace-period control. Bound to one strategy.
public struct StrategyAdminCap has key, store {
    id: UID,
    strategy_id: ID,
}

/// Keeper capability: authorizes starting and settling rounds. Bound to one strategy.
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

public struct DepositQueued has copy, drop {
    strategy_id: ID,
    depositor: address,
    amount: u64,
    round: u64,
}

public struct DepositCancelled has copy, drop {
    strategy_id: ID,
    owner: address,
    amount: u64,
}

public struct DepositsSettled has copy, drop {
    strategy_id: ID,
    round: u64,
    quote_folded: u64,
    shares_minted: u64,
    nav_before: u64,
}

public struct DepositClaimed has copy, drop {
    strategy_id: ID,
    owner: address,
    shares: u64,
}

public struct DepositRefunded has copy, drop {
    strategy_id: ID,
    owner: address,
    amount: u64,
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
    total_premium_spent: u64,
    refund_amount: u64,
    reserve_amount: u64,
    range_count: u64,
}

public struct RoundSettled has copy, drop {
    strategy_id: ID,
    predict_id: ID,
    manager_id: ID,
    oracle_id: ID,
    round: u64,
    payout_swept: u64,
    reserved_base_shares: u64,
    shares_burned: u64,
    nav_after_settle: u64,
}

/// Bootstrap a strategy bound to a base vault and a dedicated Predict manager.
/// The caller must own the manager. Returns the (unshared) strategy plus its
/// admin and keeper caps; share the strategy via `share_strategy` before use.
public fun create_strategy<Quote>(
    treasury: TreasuryCap<RLADDER>,
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
        pending_deposits: balance::zero(),
        pending_share_pool: balance::zero(),
        deposit_queue: deposit_queue::new(ctx),
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

/// Deposit quote and receive NAV-proportional RLADDER shares. Only allowed
/// between rounds. The quote is parked in the base vault as base shares
/// (the strategy holds no bare cash); shares are priced against NAV *before*
/// the deposit so existing holders are not diluted.
public fun deposit<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    funds: Coin<Quote>,
    ctx: &mut TxContext,
): Coin<RLADDER> {
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

/// Park a deposit that arrives while a round is live. The quote is held aside in
/// `pending_deposits` (out of NAV, not deployed) and recorded against the
/// current round; it mints no shares now. At the next settlement the whole
/// round's pending quote is folded into shares in one batch (see `settle_round`),
/// then each depositor pulls their slice via `claim_shares`. Refundable 1:1 via
/// `cancel_pending` until then.
public fun queue_deposit<Quote>(
    strategy: &mut Strategy<Quote>,
    funds: Coin<Quote>,
    ctx: &mut TxContext,
) {
    assert!(!strategy.paused, EPaused);
    assert!(option::is_some(&strategy.active_round), ENoActiveRound);
    let amount = funds.value();
    assert!(amount > 0, EZeroDeposit);

    let owner = ctx.sender();
    let round = strategy.deposit_queue.current_round();
    strategy.pending_deposits.join(funds.into_balance());
    strategy.deposit_queue.record(owner, amount);

    event::emit(DepositQueued {
        strategy_id: strategy.id.to_inner(),
        depositor: owner,
        amount,
        round,
    });
}

/// Back out a pending deposit before its round settles; returns the parked quote
/// 1:1. The quote never entered a round, so there is no price to set and nothing
/// to manipulate.
public fun cancel_pending<Quote>(
    strategy: &mut Strategy<Quote>,
    ctx: &mut TxContext,
): Coin<Quote> {
    let owner = ctx.sender();
    let amount = strategy.deposit_queue.cancel(owner);
    let refund = strategy.pending_deposits.split(amount).into_coin(ctx);

    event::emit(DepositCancelled {
        strategy_id: strategy.id.to_inner(),
        owner,
        amount,
    });

    refund
}

/// Pull `user`'s pro-rata slice of the shares minted for their settled deposit
/// round, and transfer it to them. Permissionless: anyone (typically the keeper)
/// can push a claim. The shares were already minted in aggregate at settlement,
/// so this is a pull from escrow — it never touches NAV or the round cadence and
/// can be called any time after the deposit's round settles.
public fun claim_shares<Quote>(
    strategy: &mut Strategy<Quote>,
    user: address,
    ctx: &mut TxContext,
) {
    let (shares, refund) = strategy.deposit_queue.claim(user);
    if (refund > 0) {
        // Dust round: the deposit was never folded; return the parked quote 1:1.
        let out = strategy.pending_deposits.split(refund).into_coin(ctx);
        transfer::public_transfer(out, user);
        event::emit(DepositRefunded {
            strategy_id: strategy.id.to_inner(),
            owner: user,
            amount: refund,
        });
    } else {
        if (shares > 0) {
            let out = strategy.pending_share_pool.split(shares).into_coin(ctx);
            transfer::public_transfer(out, user);
        };
        event::emit(DepositClaimed {
            strategy_id: strategy.id.to_inner(),
            owner: user,
            shares,
        });
    };
}

/// Instant exit, only between rounds: burn shares and release their pro-rata
/// slice of deployable base shares, redeemed for quote through the base vault.
public fun withdraw<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    shares: Coin<RLADDER>,
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

/// Queue an exit during a live round. Escrows the caller's RLADDER shares; they
/// are priced and burned at the round's settlement, then claimable as quote.
public fun request_withdraw<Quote>(
    strategy: &mut Strategy<Quote>,
    shares: Coin<RLADDER>,
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
/// RLADDER shares.
public fun cancel_request<Quote>(
    strategy: &mut Strategy<Quote>,
    ctx: &mut TxContext,
): Coin<RLADDER> {
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
/// re-issued fresh RLADDER shares at the current NAV for that value.
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

/// Open a round (keeper-only, between rounds, while unpaused). Redeems all
/// deployable base shares to a transient local coin, carves out the premium
/// budget per policy, mints the ladder of ranges through the dedicated manager,
/// reclaims any unspent premium, and redeposits all remaining quote back to base
/// shares. The strategy never retains bare cash: quote exists only inside this
/// call. Records the minted positions as the active round.
public fun start_round<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    cap: &StrategyKeeperCap,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    rungs: vector<Rung>,
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
    policy::assert_valid_rungs(&strategy.policy, &rungs);

    // Pull all deployable capital into a transient local coin.
    let mut funds = redeem_base_shares(strategy, base, ctx);
    let nav_now = funds.value();
    assert!(nav_now > 0, EZeroDeposit);

    let premium_budget_amount = bps_amount(nav_now, policy::premium_budget_bps(&strategy.policy));
    let reserve_amount = bps_amount(nav_now, policy::reserve_bps(&strategy.policy));
    assert!(premium_budget_amount > 0, EInvalidPremiumBudget);
    assert!(nav_now >= premium_budget_amount + reserve_amount, ECashLow);

    let manager_balance_before = manager.balance<Quote>();
    let premium_coin = funds.split(premium_budget_amount, ctx);
    manager.deposit<Quote>(premium_coin, ctx);

    let positions = mint_ranges<Quote>(predict, manager, oracle, rungs, clock, ctx, &strategy.policy);
    let manager_balance_after_mint = manager.balance<Quote>();
    assert!(manager_balance_after_mint >= manager_balance_before, EExceededPremiumBudget);
    let total_premium_spent = premium_budget_amount - (manager_balance_after_mint - manager_balance_before);
    assert!(total_premium_spent <= premium_budget_amount, EExceededPremiumBudget);

    // Reclaim any unspent premium and redeposit everything to base shares.
    let refund_amount = manager_balance_after_mint - manager_balance_before;
    if (refund_amount > 0) {
        funds.join(manager.withdraw<Quote>(refund_amount, ctx));
    };
    deposit_funds_to_base_shares(strategy, base, funds, ctx);

    let range_count = positions.length();
    strategy.active_round = option::some(Round {
        predict_id: object::id(predict),
        oracle_id: oracle.id(),
        positions,
    });

    event::emit(RoundStarted {
        strategy_id: strategy.id.to_inner(),
        predict_id: object::id(predict),
        manager_id: strategy.manager_id,
        oracle_id: oracle.id(),
        premium_budget_amount,
        total_premium_spent,
        refund_amount,
        reserve_amount,
        range_count,
    });
}

/// Close the round in one phase: redeem the ladder positions, return all value
/// to base shares, settle the withdrawal queue against that base-share total,
/// and clear the active round.
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

    let manager_balance_before = manager.balance<Quote>();
    round.positions.do_ref!(|position| {
        let key = position.position_key();
        let quantity = position.position_quantity();
        assert_range_position(manager, key, quantity);
        predict.redeem_range<Quote>(manager, oracle, key, quantity, clock, ctx);
    });

    let manager_balance_after = manager.balance<Quote>();
    assert!(manager_balance_after >= manager_balance_before, EInvalidRangePayout);

    // Pull all proceeds out of the manager and back into deployable base shares.
    let payout_swept = manager_balance_after;
    if (payout_swept > 0) {
        let proceeds = manager.withdraw<Quote>(payout_swept, ctx);
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

    fold_pending_deposits(strategy, base, ctx);

    event::emit(RoundSettled {
        strategy_id: strategy.id.to_inner(),
        predict_id: round.predict_id,
        manager_id: strategy.manager_id,
        oracle_id: round.oracle_id,
        round: settle_round,
        payout_swept,
        reserved_base_shares: reserved,
        shares_burned: burned,
        nav_after_settle: strategy.nav(base),
    });
}

/// Admin-only emergency pause. Blocks deposits and starting rounds.
public fun set_paused<Quote>(strategy: &mut Strategy<Quote>, cap: &StrategyAdminCap, paused: bool) {
    assert_strategy_admin_cap(strategy, cap);
    strategy.paused = paused;
}

/// Admin-only policy swap. Takes effect for the next round.
public fun set_policy<Quote>(strategy: &mut Strategy<Quote>, cap: &StrategyAdminCap, policy: Policy) {
    assert_strategy_admin_cap(strategy, cap);
    strategy.policy = policy;
}

/// Admin-only update of the stale-withdrawal grace period. Must be at least one
/// round so a request can never be swept in the same round it settles.
public fun set_stale_grace<Quote>(strategy: &mut Strategy<Quote>, cap: &StrategyAdminCap, rounds: u64) {
    assert_strategy_admin_cap(strategy, cap);
    assert!(rounds > 0, EZeroGraceRounds);
    strategy.stale_withdrawal_grace_rounds = rounds;
}

/// Shares minted for a deposit of `amount` into a strategy at `nav_before` /
/// `supply`. First deposit mints 1:1; thereafter pro-rata, rounding down.
public fun shares_for_deposit(nav_before: u64, supply: u64, amount: u64): u64 {
    if (supply == 0 || nav_before == 0) {
        amount
    } else {
        ((amount as u128) * (supply as u128) / (nav_before as u128)) as u64
    }
}

/// Quote/base-share value owed for burning `shares` at `nav_now` / `supply`.
/// Rounds down.
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

/// Quote parked in the current round's pending deposits (held aside, out of NAV).
public fun pending_deposits_total<Quote>(strategy: &Strategy<Quote>): u64 {
    strategy.pending_deposits.value()
}

/// Minted-but-unclaimed shares escrowed for settled depositors.
public fun pending_share_pool_amount<Quote>(strategy: &Strategy<Quote>): u64 {
    strategy.pending_share_pool.value()
}

public fun deposit_round<Quote>(strategy: &Strategy<Quote>): u64 {
    strategy.deposit_queue.current_round()
}

public fun has_pending_deposit<Quote>(strategy: &Strategy<Quote>, user: address): bool {
    strategy.deposit_queue.has_pending(user)
}

public fun pending_deposit_amount<Quote>(strategy: &Strategy<Quote>, user: address): u64 {
    strategy.deposit_queue.pending_amount(user)
}

/// True once the user's deposit round has settled — i.e. `claim_shares` will work.
public fun pending_deposit_settled<Quote>(strategy: &Strategy<Quote>, user: address): bool {
    strategy.deposit_queue.is_settled(user)
}

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

public fun round_positions(round: &Round): vector<Position> { round.positions }

public fun round_position_count(round: &Round): u64 { round.positions.length() }

/// Abort unless `cap` is this strategy's admin cap.
public(package) fun assert_strategy_admin_cap<Quote>(strategy: &Strategy<Quote>, cap: &StrategyAdminCap) {
    assert!(cap.strategy_id == strategy.id.to_inner(), EWrongStrategyAdminCap);
}

/// Abort unless `cap` is this strategy's keeper cap.
public(package) fun assert_strategy_keeper_cap<Quote>(strategy: &Strategy<Quote>, cap: &StrategyKeeperCap) {
    assert!(cap.strategy_id == strategy.id.to_inner(), EWrongStrategyKeeperCap);
}

// Refuse a base vault object that is not the one this strategy was bound to.
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

/// Fold the current deposit round's parked quote into shares at the now-exact,
/// post-withdrawal NAV, minting the whole round in one batch into the escrow
/// pool. Pricing here (after withdrawals are carved out) keeps new entrants out
/// of the just-settled round's PnL, and one mint covers any number of
/// depositors. If the whole round's quote is worth less than a single share
/// (dust), the round is settled in refund mode: nothing is folded, and
/// depositors reclaim their quote 1:1 via `claim_shares`. Always advances the
/// deposit round, so pending can never carry into — or be mispriced across — the
/// next round.
fun fold_pending_deposits<Quote>(
    strategy: &mut Strategy<Quote>,
    base: &mut BaseVault<Quote>,
    ctx: &mut TxContext,
) {
    let round = strategy.deposit_queue.current_round();
    let pending_quote = strategy.deposit_queue.pending_quote(round);
    if (pending_quote == 0) {
        strategy.deposit_queue.skip();
        return
    };

    let nav_before = strategy.nav(base);
    let supply = strategy.share_supply();
    // Estimate against the parked quote (the base vault is ~1:1 here): if the
    // whole round can't mint even one share, settle as a refund round and leave
    // the quote untouched for 1:1 reclaim.
    if (shares_for_deposit(nav_before, supply, pending_quote) == 0) {
        strategy.deposit_queue.settle(0);
        event::emit(DepositsSettled {
            strategy_id: strategy.id.to_inner(),
            round,
            quote_folded: 0,
            shares_minted: 0,
            nav_before,
        });
        return
    };

    let funds = strategy.pending_deposits.split(pending_quote).into_coin(ctx);
    let base_coin = base_vault::deposit(base, funds, ctx);
    let base_value = base.value_for_shares(base_coin.value());
    let real = shares_for_deposit(nav_before, supply, base_value);
    // The estimate guaranteed a >= 1-share contribution; a base-vault rounding
    // boundary can still floor `real` to 0, so mint at least one — fair, because
    // the round's quote is worth at least one share.
    let minted_shares = if (real > 0) { real } else { 1 };

    strategy.base_shares.join(base_coin.into_balance());
    let minted = coin::mint(&mut strategy.treasury, minted_shares, ctx);
    strategy.pending_share_pool.join(minted.into_balance());
    strategy.deposit_queue.settle(minted_shares);

    event::emit(DepositsSettled {
        strategy_id: strategy.id.to_inner(),
        round,
        quote_folded: pending_quote,
        shares_minted: minted_shares,
        nav_before,
    });
}

// Mint each requested rung as a Predict range, paying premium out of the
// manager's funded balance. Each leg is double-checked against the policy ask
// ceiling (once on the quoted ask, once on the realized fill cost) and asserts
// the position started empty, so a pre-existing position can't inflate the
// recorded quantity. Returns the realized positions to record on the round.
fun mint_ranges<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    rungs: vector<Rung>,
    clock: &Clock,
    ctx: &mut TxContext,
    strategy_policy: &Policy,
): vector<Position> {
    let mut minted = vector[];
    rungs.do!(|rung| {
        let key = range_key::new(oracle.id(), oracle.expiry(), rung.lower_strike(), rung.higher_strike());
        assert_range_position(manager, key, 0);
        let (ask_cost, _) = predict.get_range_trade_amounts(oracle, key, rung.quantity(), clock);
        assert_range_ask_within_ceiling(strategy_policy, ask_cost, rung.quantity());

        let balance_before = manager.balance<Quote>();
        predict.mint_range<Quote>(manager, oracle, key, rung.quantity(), clock, ctx);
        let balance_after = manager.balance<Quote>();
        assert!(balance_after <= balance_before, EExceededPremiumBudget);
        let cost = balance_before - balance_after;
        assert_range_ask_within_ceiling(strategy_policy, cost, rung.quantity());
        minted.push_back(policy::new_position(key, rung.quantity(), cost));
    });
    minted
}

// Assert the manager's holding of `key` equals `expected_quantity`. Used to
// confirm a position is untouched (settlement) or empty (before minting).
fun assert_range_position(manager: &PredictManager, key: RangeKey, expected_quantity: u64) {
    assert!(manager.range_position(key) == expected_quantity, EPositionChanged);
}

// Enforce ask_cost / quantity <= max_range_ask_bps / BPS_DENOMINATOR, written
// as a cross-multiplied u128 comparison to avoid division and overflow.
fun assert_range_ask_within_ceiling(strategy_policy: &Policy, ask_cost: u64, quantity: u64) {
    assert!((ask_cost as u128) * (BPS_DENOMINATOR as u128) <= (quantity as u128) * (policy::max_range_ask_bps(strategy_policy) as u128), ERangeAskAboveCeiling);
}

// `amount * bps / 10_000`, computed in u128 to avoid intermediate overflow.
fun bps_amount(amount: u64, bps: u16): u64 {
    ((amount as u128) * (bps as u128) / (BPS_DENOMINATOR as u128)) as u64
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
