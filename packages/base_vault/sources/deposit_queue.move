/// Reusable pending-deposit queue for CallIt strategy vaults.
///
/// Mirror image of `withdrawal_queue`: shared CODE, not shared state. Each
/// Strategy owns its own `DepositQueue` instance. The queue is pure bookkeeping
/// in quote-amount units; it never holds coins — the embedding strategy escrows
/// the quote in a `pending_deposits` balance and the minted shares in a
/// `pending_share_pool`.
///
/// Why it exists: deposits that land while a round is live can't be priced —
/// the vault's value is mid-flight until the oracle settles, so minting shares
/// then would dilute. Instead the quote is parked, sits out the round, and is
/// converted at the next settlement when NAV is exact again.
///
/// This is the Ribbon/ERC-7540 shape: at settlement the strategy folds the whole
/// round's pending quote into the pool and mints the round's shares in ONE batch
/// (`settle`), then each depositor pulls their pro-rata slice lazily (`claim`),
/// with the last claimant sweeping rounding dust. There is no per-user
/// activation and nothing blocks the next round, so it scales to any number of
/// pending depositors. `cancel` backs out before settlement for a 1:1 refund.
module base_vault::deposit_queue;

use sui::table::{Self, Table};

#[error]
const EAlreadyQueued: vector<u8> = b"Address has an unclaimed pending deposit; claim it before depositing again";

#[error]
const ENoDeposit: vector<u8> = b"No pending deposit for this address";

#[error]
const EDepositNotSettled: vector<u8> = b"Pending deposit's round has not settled yet";

#[error]
const EDepositSettled: vector<u8> = b"Deposit already settled; claim shares instead of cancelling";

#[error]
const EZeroAmount: vector<u8> = b"Pending deposit must be for a non-zero amount";

public struct Pending has store, copy, drop {
    amount: u64,
    round_id: u64,
}

public struct DepositQueue has store {
    current_round: u64,
    pending: Table<address, Pending>,
    // round_id -> total quote parked in that round
    round_pending_quote: Table<u64, u64>,
    // round_id -> strategy shares minted for that round's quote at settlement
    round_minted_shares: Table<u64, u64>,
}

public fun new(ctx: &mut TxContext): DepositQueue {
    DepositQueue {
        current_round: 0,
        pending: table::new(ctx),
        round_pending_quote: table::new(ctx),
        round_minted_shares: table::new(ctx),
    }
}

/// Record `amount` of quote parked by `user` against the current round. Repeated
/// deposits within the same round accumulate; an unclaimed entry from an earlier
/// (settled) round must be claimed first.
public fun record(queue: &mut DepositQueue, user: address, amount: u64) {
    assert!(amount > 0, EZeroAmount);
    let round = queue.current_round;
    if (queue.pending.contains(user)) {
        let entry = queue.pending.borrow_mut(user);
        assert!(entry.round_id == round, EAlreadyQueued);
        entry.amount = entry.amount + amount;
    } else {
        queue.pending.add(user, Pending { amount, round_id: round });
    };
    if (queue.round_pending_quote.contains(round)) {
        let total = queue.round_pending_quote.borrow_mut(round);
        *total = *total + amount;
    } else {
        queue.round_pending_quote.add(round, amount);
    };
}

/// Cancel an unsettled deposit (current round). Returns the quote amount to
/// refund 1:1 — the quote never participated, so there is nothing to price.
public fun cancel(queue: &mut DepositQueue, user: address): u64 {
    assert!(queue.pending.contains(user), ENoDeposit);
    let round_id = queue.pending.borrow(user).round_id;
    assert!(round_id == queue.current_round, EDepositSettled);
    let Pending { amount, round_id: _ } = queue.pending.remove(user);
    let total = queue.round_pending_quote.borrow_mut(round_id);
    *total = *total - amount;
    if (*total == 0) {
        queue.round_pending_quote.remove(round_id);
    };
    amount
}

/// Settle the current round: record the `minted_shares` the strategy minted for
/// this round's pending quote (in one batch), then advance the round. Call only
/// when the round actually had pending quote (the strategy folds it first).
public fun settle(queue: &mut DepositQueue, minted_shares: u64) {
    let round = queue.current_round;
    if (queue.pending_quote(round) > 0) {
        queue.round_minted_shares.add(round, minted_shares);
    };
    queue.current_round = round + 1;
}

/// Advance the round with no fold (no pending quote this round).
public fun skip(queue: &mut DepositQueue) {
    queue.current_round = queue.current_round + 1;
}

/// Claim a settled deposit. Returns `(shares, refund_quote)` where exactly one is
/// non-zero: a normal round (shares were minted) pays the pro-rata share slice;
/// a dust round (the whole round's quote was worth < one share, so nothing was
/// minted) refunds the parked quote 1:1 instead. The strategy delivers whichever
/// is non-zero. Exactly one path per round, so the two never mix for a user.
public fun claim(queue: &mut DepositQueue, user: address): (u64, u64) {
    assert!(queue.pending.contains(user), ENoDeposit);
    let round_id = queue.pending.borrow(user).round_id;
    assert!(round_id < queue.current_round, EDepositNotSettled);
    if (queue.minted_shares(round_id) > 0) {
        (queue.take_shares(user), 0)
    } else {
        (0, queue.take_refund(user))
    }
}

// Remove a settled deposit and return its pro-rata slice of the round's minted
// shares. The final claimant of a round sweeps rounding dust (amount ==
// remaining quote => owed == remaining minted), so nothing is stranded.
fun take_shares(queue: &mut DepositQueue, user: address): u64 {
    let Pending { amount, round_id } = queue.pending.remove(user);
    let total_quote = queue.round_pending_quote.borrow_mut(round_id);
    let total_minted = queue.round_minted_shares.borrow_mut(round_id);
    let owed = ((*total_minted as u128) * (amount as u128) / (*total_quote as u128)) as u64;
    *total_quote = *total_quote - amount;
    *total_minted = *total_minted - owed;
    if (*total_quote == 0) {
        queue.round_pending_quote.remove(round_id);
        queue.round_minted_shares.remove(round_id);
    };
    owed
}

// Remove a settled deposit from a dust round and return its quote to refund 1:1.
fun take_refund(queue: &mut DepositQueue, user: address): u64 {
    let Pending { amount, round_id } = queue.pending.remove(user);
    let total_quote = queue.round_pending_quote.borrow_mut(round_id);
    *total_quote = *total_quote - amount;
    if (*total_quote == 0) {
        queue.round_pending_quote.remove(round_id);
        if (queue.round_minted_shares.contains(round_id)) {
            queue.round_minted_shares.remove(round_id);
        };
    };
    amount
}

/// Whether `user`'s settled deposit round is a dust (refund) round — i.e. `claim`
/// will refund quote rather than pay shares. Only meaningful once settled.
public fun is_refund_round(queue: &DepositQueue, user: address): bool {
    let round_id = queue.pending.borrow(user).round_id;
    round_id < queue.current_round && queue.minted_shares(round_id) == 0
}

// ----- views -----

public fun current_round(queue: &DepositQueue): u64 { queue.current_round }

public fun has_pending(queue: &DepositQueue, user: address): bool {
    queue.pending.contains(user)
}

public fun pending_amount(queue: &DepositQueue, user: address): u64 {
    queue.pending.borrow(user).amount
}

public fun pending_round(queue: &DepositQueue, user: address): u64 {
    queue.pending.borrow(user).round_id
}

public fun is_settled(queue: &DepositQueue, user: address): bool {
    queue.pending.contains(user) && queue.pending.borrow(user).round_id < queue.current_round
}

public fun pending_quote(queue: &DepositQueue, round: u64): u64 {
    if (queue.round_pending_quote.contains(round)) {
        *queue.round_pending_quote.borrow(round)
    } else {
        0
    }
}

public fun minted_shares(queue: &DepositQueue, round: u64): u64 {
    if (queue.round_minted_shares.contains(round)) {
        *queue.round_minted_shares.borrow(round)
    } else {
        0
    }
}

#[test_only]
public fun destroy_for_testing(queue: DepositQueue) {
    let DepositQueue {
        current_round: _,
        pending,
        round_pending_quote,
        round_minted_shares,
    } = queue;
    pending.drop();
    round_pending_quote.drop();
    round_minted_shares.drop();
}
