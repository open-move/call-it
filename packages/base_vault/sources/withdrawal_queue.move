/// Reusable withdrawal-request queue for CallIt strategy vaults.
///
/// Shared CODE, not shared state: the type is defined once here, but each
/// Strategy owns its own `WithdrawalQueue` instance — there is no global queue.
/// The queue is pure bookkeeping in strategy-share units; it never holds coins.
/// The embedding strategy escrows the share coins and holds the reserved base
/// shares. The queue just tracks who is owed what, priced at the round they
/// exited in.
///
/// Lifecycle: `request` (during a round) -> `settle` (at the round's settlement,
/// snapshots the reserve and advances the round) -> `claim` (pull, any time
/// after). `cancel` backs out before settlement; `sweep_stale` rolls back an
/// abandoned request after a disclosed grace period.
module base_vault::withdrawal_queue;

use sui::table::{Self, Table};

#[error]
const EAlreadyQueued: vector<u8> = b"Address already has an open withdrawal request";

#[error]
const ENoRequest: vector<u8> = b"No withdrawal request for this address";

#[error]
const ERequestNotSettled: vector<u8> = b"Request's round has not settled yet";

#[error]
const ERequestSettled: vector<u8> = b"Request already settled; claim instead of cancel";

#[error]
const ENotStale: vector<u8> = b"Request has not reached the stale grace period";

#[error]
const EZeroShares: vector<u8> = b"Withdrawal request must be for a non-zero share amount";

public struct Request has store, copy, drop {
    shares: u64,
    round_id: u64,
}

public struct WithdrawalQueue has store {
    current_round: u64,
    pending: Table<address, Request>,
    // round_id -> total escrowed strategy shares requested in that round
    round_pending_shares: Table<u64, u64>,
    // round_id -> base shares set aside for that round at settlement
    round_reserved_base: Table<u64, u64>,
}

public fun new(ctx: &mut TxContext): WithdrawalQueue {
    WithdrawalQueue {
        current_round: 0,
        pending: table::new(ctx),
        round_pending_shares: table::new(ctx),
        round_reserved_base: table::new(ctx),
    }
}

/// Queue `shares` for `user` against the current round. The strategy must have
/// escrowed the matching share coins. One open request per address.
public fun request(queue: &mut WithdrawalQueue, user: address, shares: u64) {
    assert!(shares > 0, EZeroShares);
    assert!(!queue.pending.contains(user), EAlreadyQueued);
    let round = queue.current_round;
    queue.pending.add(user, Request { shares, round_id: round });
    if (queue.round_pending_shares.contains(round)) {
        let total = queue.round_pending_shares.borrow_mut(round);
        *total = *total + shares;
    } else {
        queue.round_pending_shares.add(round, shares);
    };
}

/// Cancel an unsettled request. Returns the escrowed share amount to refund.
public fun cancel(queue: &mut WithdrawalQueue, user: address): u64 {
    assert!(queue.pending.contains(user), ENoRequest);
    let round_id = queue.pending.borrow(user).round_id;
    assert!(round_id == queue.current_round, ERequestSettled);
    let Request { shares, round_id: _ } = queue.pending.remove(user);
    let total = queue.round_pending_shares.borrow_mut(round_id);
    *total = *total - shares;
    if (*total == 0) {
        queue.round_pending_shares.remove(round_id);
    };
    shares
}

/// Snapshot the current round at settlement: record the base shares reserved for
/// this round's pending requests (computed pro-rata by the strategy), then
/// advance the round. Returns the round's pending share total — the escrowed
/// shares the strategy should now burn.
public fun settle(queue: &mut WithdrawalQueue, reserved_base: u64): u64 {
    let round = queue.current_round;
    let pending = queue.pending_shares(round);
    if (pending > 0) {
        queue.round_reserved_base.add(round, reserved_base);
    };
    queue.current_round = round + 1;
    pending
}

/// Claim a settled request. Returns the base-share amount owed; the strategy
/// withdraws that many base shares and delivers the quote.
public fun claim(queue: &mut WithdrawalQueue, user: address): u64 {
    assert!(queue.pending.contains(user), ENoRequest);
    assert!(queue.pending.borrow(user).round_id < queue.current_round, ERequestNotSettled);
    queue.take(user)
}

/// Roll back an abandoned request after the grace period (disclosed in terms).
/// Returns the base-share amount that was reserved for the user — the strategy
/// returns it to deployable capital and re-issues fresh shares at current NAV.
public fun sweep_stale(queue: &mut WithdrawalQueue, user: address, grace_rounds: u64): u64 {
    assert!(queue.pending.contains(user), ENoRequest);
    let round_id = queue.pending.borrow(user).round_id;
    assert!(round_id < queue.current_round, ERequestNotSettled);
    assert!(queue.current_round - round_id >= grace_rounds, ENotStale);
    queue.take(user)
}

// Remove a settled request and return its pro-rata slice of the round's reserve.
// The final claimant of a round sweeps any rounding dust (shares == remaining
// pending => owed == remaining reserve), so nothing is stranded.
fun take(queue: &mut WithdrawalQueue, user: address): u64 {
    let Request { shares, round_id } = queue.pending.remove(user);
    let total_pending = queue.round_pending_shares.borrow_mut(round_id);
    let total_reserved = queue.round_reserved_base.borrow_mut(round_id);
    let owed = ((*total_reserved as u128) * (shares as u128) / (*total_pending as u128)) as u64;
    *total_pending = *total_pending - shares;
    *total_reserved = *total_reserved - owed;
    if (*total_pending == 0) {
        queue.round_pending_shares.remove(round_id);
        queue.round_reserved_base.remove(round_id);
    };
    owed
}

// ----- views -----

public fun current_round(queue: &WithdrawalQueue): u64 { queue.current_round }

public fun has_request(queue: &WithdrawalQueue, user: address): bool {
    queue.pending.contains(user)
}

public fun request_shares(queue: &WithdrawalQueue, user: address): u64 {
    queue.pending.borrow(user).shares
}

public fun request_round(queue: &WithdrawalQueue, user: address): u64 {
    queue.pending.borrow(user).round_id
}

public fun is_settled(queue: &WithdrawalQueue, user: address): bool {
    queue.pending.contains(user) && queue.pending.borrow(user).round_id < queue.current_round
}

public fun pending_shares(queue: &WithdrawalQueue, round: u64): u64 {
    if (queue.round_pending_shares.contains(round)) {
        *queue.round_pending_shares.borrow(round)
    } else {
        0
    }
}

public fun reserved_base(queue: &WithdrawalQueue, round: u64): u64 {
    if (queue.round_reserved_base.contains(round)) {
        *queue.round_reserved_base.borrow(round)
    } else {
        0
    }
}

#[test_only]
public fun destroy_for_testing(queue: WithdrawalQueue) {
    let WithdrawalQueue {
        current_round: _,
        pending,
        round_pending_shares,
        round_reserved_base,
    } = queue;
    pending.drop();
    round_pending_shares.drop();
    round_reserved_base.drop();
}
