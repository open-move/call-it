/// Opt-in keeper reward vault for CallIt.
///
/// DeepBook Predict pays a redeemed binary position into the position owner's
/// `PredictManager`, not to the executor. A permissionless keeper therefore
/// only pays gas and earns nothing natively. This vault lets an operator
/// pre-fund a fixed, admin-set reward that is paid to the keeper atomically in
/// the same transaction that performs the redemption.
///
/// The reward is independent of the Predict payout. It is paid from this
/// vault's own balance, only for allow-listed managers, and only after the
/// underlying `predict::redeem_permissionless` succeeds. The keeper cannot
/// choose the reward amount: it is a fixed value stored on the vault and
/// gated by an `min_payout` floor and a manager allow-list.
module keeper_rewards::reward_vault;

use sui::{balance::{Self, Balance}, clock::Clock, coin::{Self, Coin}, event, vec_set::{Self, VecSet}};

use deepbook_predict::{
    market_key::MarketKey,
    oracle::OracleSVI,
    predict::Predict,
    predict_manager::PredictManager,
};

// === Errors ===
const EWrongAdminCap: u64 = 0;
const EPaused: u64 = 1;
const EWrongPredict: u64 = 2;
const EManagerNotAllowed: u64 = 3;
const EOracleNotSettled: u64 = 4;
const ENoPosition: u64 = 5;
const EPayoutBelowMin: u64 = 6;
const EInsufficientRewards: u64 = 7;

// === Structs ===

/// Pre-funded pool that pays a fixed reward per eligible keeper redemption.
public struct RewardVault<phantom Reward> has key {
    id: UID,
    /// The Predict object this vault is bound to. Redemptions for any other
    /// Predict are rejected.
    predict_id: ID,
    /// Funds available to pay keeper rewards.
    rewards: Balance<Reward>,
    /// Managers whose settled positions are eligible for a reward.
    allowed_managers: VecSet<ID>,
    /// Fixed reward paid per eligible redemption.
    reward_amount: u64,
    /// Minimum Predict payout (in quote units) required to pay a reward. Filters
    /// out dust and losing positions, whose settled payout is zero.
    min_payout: u64,
    paused: bool,
}

/// Ongoing admin authority over a single `RewardVault`.
public struct RewardVaultAdminCap has key, store {
    id: UID,
    vault_id: ID,
}

// === Events ===

public struct RewardVaultCreated has copy, drop {
    vault_id: ID,
    cap_id: ID,
    predict_id: ID,
}

public struct RewardVaultFunded has copy, drop {
    vault_id: ID,
    funder: address,
    amount: u64,
}

public struct RewardVaultWithdrawn has copy, drop {
    vault_id: ID,
    amount: u64,
}

public struct RewardVaultPolicyUpdated has copy, drop {
    vault_id: ID,
    reward_amount: u64,
    min_payout: u64,
}

public struct RewardVaultManagerSet has copy, drop {
    vault_id: ID,
    manager_id: ID,
    allowed: bool,
}

public struct RewardVaultPaused has copy, drop {
    vault_id: ID,
    paused: bool,
}

public struct RewardPaid has copy, drop {
    vault_id: ID,
    executor: address,
    manager_id: ID,
    oracle_id: ID,
    expiry: u64,
    strike: u64,
    is_up: bool,
    quantity: u64,
    payout: u64,
    reward_amount: u64,
}

// === Public Functions ===

/// Create a reward vault bound to `predict`, returning it alongside its admin
/// cap. The caller shares the vault and keeps the cap.
public fun create_vault<Reward>(
    predict: &Predict,
    reward_amount: u64,
    min_payout: u64,
    ctx: &mut TxContext,
): (RewardVault<Reward>, RewardVaultAdminCap) {
    let predict_id = object::id(predict);
    let vault = RewardVault<Reward> {
        id: object::new(ctx),
        predict_id,
        rewards: balance::zero(),
        allowed_managers: vec_set::empty(),
        reward_amount,
        min_payout,
        paused: false,
    };
    let vault_id = vault.id.to_inner();
    let cap = RewardVaultAdminCap { id: object::new(ctx), vault_id };

    event::emit(RewardVaultCreated { vault_id, cap_id: cap.id.to_inner(), predict_id });

    (vault, cap)
}

public fun share_vault<Reward>(vault: RewardVault<Reward>) {
    transfer::share_object(vault);
}

/// Top up the reward balance. Permissionless: anyone may fund the vault.
public fun fund<Reward>(vault: &mut RewardVault<Reward>, funds: Coin<Reward>, ctx: &TxContext) {
    let amount = funds.value();
    vault.rewards.join(funds.into_balance());
    event::emit(RewardVaultFunded { vault_id: vault.id.to_inner(), funder: ctx.sender(), amount });
}

/// Withdraw reward funds. Admin only. Returns the coin to the caller.
public fun withdraw<Reward>(
    vault: &mut RewardVault<Reward>,
    cap: &RewardVaultAdminCap,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Reward> {
    assert_admin_cap(vault, cap);
    let out = coin::from_balance(vault.rewards.split(amount), ctx);
    event::emit(RewardVaultWithdrawn { vault_id: vault.id.to_inner(), amount });
    out
}

/// Update the reward policy. Admin only.
public fun set_policy<Reward>(
    vault: &mut RewardVault<Reward>,
    cap: &RewardVaultAdminCap,
    reward_amount: u64,
    min_payout: u64,
) {
    assert_admin_cap(vault, cap);
    vault.reward_amount = reward_amount;
    vault.min_payout = min_payout;
    event::emit(RewardVaultPolicyUpdated {
        vault_id: vault.id.to_inner(),
        reward_amount,
        min_payout,
    });
}

/// Allow a manager's settled positions to earn rewards. Admin only. Idempotent.
public fun allow_manager<Reward>(
    vault: &mut RewardVault<Reward>,
    cap: &RewardVaultAdminCap,
    manager: &PredictManager,
) {
    assert_admin_cap(vault, cap);
    let manager_id = object::id(manager);
    if (!vault.allowed_managers.contains(&manager_id)) {
        vault.allowed_managers.insert(manager_id);
    };
    event::emit(RewardVaultManagerSet { vault_id: vault.id.to_inner(), manager_id, allowed: true });
}

/// Remove a manager from the allow-list. Admin only. Idempotent.
public fun disallow_manager<Reward>(
    vault: &mut RewardVault<Reward>,
    cap: &RewardVaultAdminCap,
    manager_id: ID,
) {
    assert_admin_cap(vault, cap);
    if (vault.allowed_managers.contains(&manager_id)) {
        vault.allowed_managers.remove(&manager_id);
    };
    event::emit(RewardVaultManagerSet { vault_id: vault.id.to_inner(), manager_id, allowed: false });
}

/// Pause or unpause reward payouts. Admin only.
public fun set_paused<Reward>(
    vault: &mut RewardVault<Reward>,
    cap: &RewardVaultAdminCap,
    paused: bool,
) {
    assert_admin_cap(vault, cap);
    vault.paused = paused;
    event::emit(RewardVaultPaused { vault_id: vault.id.to_inner(), paused });
}

/// Redeem a settled, winning binary position permissionlessly and pay the
/// caller the vault's fixed reward.
///
/// The full open position quantity is redeemed, so a position can be rewarded
/// at most once. The payout is paid into the manager (per Predict semantics);
/// the reward coin is returned to the caller. Aborts unless the oracle is
/// settled, the manager is allow-listed, the Predict matches, the position is
/// non-empty, the settled payout meets `min_payout`, and the vault holds enough
/// reward funds.
public fun redeem_with_reward<Quote, Reward>(
    vault: &mut RewardVault<Reward>,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Reward> {
    assert!(!vault.paused, EPaused);
    assert!(object::id(predict) == vault.predict_id, EWrongPredict);

    let manager_id = object::id(manager);
    assert!(vault.allowed_managers.contains(&manager_id), EManagerNotAllowed);
    assert!(oracle.is_settled(), EOracleNotSettled);

    let quantity = manager.position(key);
    assert!(quantity > 0, ENoPosition);

    let (_, payout) = predict.get_trade_amounts(oracle, key, quantity, clock);
    assert!(payout >= vault.min_payout, EPayoutBelowMin);
    assert!(vault.rewards.value() >= vault.reward_amount, EInsufficientRewards);

    predict.redeem_permissionless<Quote>(manager, oracle, key, quantity, clock, ctx);

    let reward = coin::from_balance(vault.rewards.split(vault.reward_amount), ctx);

    event::emit(RewardPaid {
        vault_id: vault.id.to_inner(),
        executor: ctx.sender(),
        manager_id,
        oracle_id: oracle.id(),
        expiry: key.expiry(),
        strike: key.strike(),
        is_up: key.is_up(),
        quantity,
        payout,
        reward_amount: vault.reward_amount,
    });

    reward
}

// === Views ===

public fun id<Reward>(vault: &RewardVault<Reward>): ID { vault.id.to_inner() }

public fun predict_id<Reward>(vault: &RewardVault<Reward>): ID { vault.predict_id }

public fun rewards_value<Reward>(vault: &RewardVault<Reward>): u64 { vault.rewards.value() }

public fun reward_amount<Reward>(vault: &RewardVault<Reward>): u64 { vault.reward_amount }

public fun min_payout<Reward>(vault: &RewardVault<Reward>): u64 { vault.min_payout }

public fun paused<Reward>(vault: &RewardVault<Reward>): bool { vault.paused }

public fun is_manager_allowed<Reward>(vault: &RewardVault<Reward>, manager_id: ID): bool {
    vault.allowed_managers.contains(&manager_id)
}

public fun cap_vault_id(cap: &RewardVaultAdminCap): ID { cap.vault_id }

// === Private Functions ===

fun assert_admin_cap<Reward>(vault: &RewardVault<Reward>, cap: &RewardVaultAdminCap) {
    assert!(cap.vault_id == vault.id.to_inner(), EWrongAdminCap);
}
