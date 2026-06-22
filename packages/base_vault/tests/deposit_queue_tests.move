#[test_only]
module base_vault::deposit_queue_tests;

use base_vault::deposit_queue::{Self as dq, DepositQueue};
use std::unit_test::assert_eq;
use sui::test_scenario::{begin, end};

const A: address = @0xA;
const B: address = @0xB;
const C: address = @0xC;

fun fresh(): (DepositQueue, sui::test_scenario::Scenario) {
    let mut test = begin(A);
    let queue = dq::new(test.ctx());
    (queue, test)
}

#[test]
fun record_settle_claim_single_user() {
    let (mut queue, test) = fresh();

    dq::record(&mut queue, A, 100);
    assert_eq!(queue.current_round(), 0);
    assert_eq!(queue.pending_quote(0), 100);
    assert!(queue.has_pending(A));
    assert!(!queue.is_settled(A));

    // Strategy folded the 100 quote into 100 minted shares for round 0.
    dq::settle(&mut queue, 100);
    assert_eq!(queue.current_round(), 1);
    assert_eq!(queue.minted_shares(0), 100);
    assert!(queue.is_settled(A));

    let (owed, refund) = dq::claim(&mut queue, A);
    assert_eq!(owed, 100);
    assert_eq!(refund, 0);
    assert!(!queue.has_pending(A));
    // Fully drained round entries are cleaned up.
    assert_eq!(queue.pending_quote(0), 0);
    assert_eq!(queue.minted_shares(0), 0);

    queue.destroy_for_testing();
    end(test);
}

#[test]
fun two_users_split_minted_pro_rata() {
    let (mut queue, test) = fresh();

    dq::record(&mut queue, A, 100);
    dq::record(&mut queue, B, 300);
    assert_eq!(queue.pending_quote(0), 400);

    // 400 quote folded into 800 shares (vault gained over the round).
    dq::settle(&mut queue, 800);

    let (owed_a, _) = dq::claim(&mut queue, A); // 800 * 100/400 = 200
    assert_eq!(owed_a, 200);
    let (owed_b, _) = dq::claim(&mut queue, B); // remainder: 600 * 300/300 = 600
    assert_eq!(owed_b, 600);
    assert_eq!(owed_a + owed_b, 800);

    queue.destroy_for_testing();
    end(test);
}

#[test]
fun last_claimant_sweeps_rounding_dust() {
    let (mut queue, test) = fresh();

    dq::record(&mut queue, A, 1);
    dq::record(&mut queue, B, 1);
    dq::record(&mut queue, C, 1);
    dq::settle(&mut queue, 100); // doesn't divide evenly by 3

    let (a, _) = dq::claim(&mut queue, A); // 100*1/3 = 33
    let (b, _) = dq::claim(&mut queue, B); // 67*1/2 = 33
    let (c, _) = dq::claim(&mut queue, C); // remainder = 34
    assert_eq!(a, 33);
    assert_eq!(b, 33);
    assert_eq!(c, 34);
    assert_eq!(a + b + c, 100); // nothing stranded

    queue.destroy_for_testing();
    end(test);
}

#[test]
fun repeated_records_same_round_accumulate() {
    let (mut queue, test) = fresh();

    dq::record(&mut queue, A, 100);
    dq::record(&mut queue, A, 50);
    assert_eq!(queue.pending_amount(A), 150);
    assert_eq!(queue.pending_quote(0), 150);

    queue.destroy_for_testing();
    end(test);
}

#[test]
fun cancel_before_settle_refunds_full() {
    let (mut queue, test) = fresh();

    dq::record(&mut queue, A, 100);
    let refunded = dq::cancel(&mut queue, A);
    assert_eq!(refunded, 100);
    assert!(!queue.has_pending(A));
    assert_eq!(queue.pending_quote(0), 0);

    queue.destroy_for_testing();
    end(test);
}

#[test]
fun skip_advances_round_when_empty() {
    let (mut queue, test) = fresh();
    dq::skip(&mut queue);
    assert_eq!(queue.current_round(), 1);
    queue.destroy_for_testing();
    end(test);
}

#[test]
fun record_after_claim_attaches_to_new_round() {
    let (mut queue, test) = fresh();

    dq::record(&mut queue, A, 100);
    dq::settle(&mut queue, 100); // round 0 -> 1
    let (_, _) = dq::claim(&mut queue, A);
    // Re-depositing now lands in round 1.
    dq::record(&mut queue, A, 50);
    assert_eq!(queue.pending_round(A), 1);
    assert_eq!(queue.pending_quote(1), 50);

    queue.destroy_for_testing();
    end(test);
}

#[test]
fun dust_round_refunds_quote() {
    let (mut queue, test) = fresh();
    dq::record(&mut queue, A, 100);
    // Strategy folded zero shares (whole round worth < one share): settle(0).
    dq::settle(&mut queue, 100 * 0); // settle with minted == 0
    assert!(queue.is_settled(A));
    assert!(queue.is_refund_round(A));

    let (shares, refund) = dq::claim(&mut queue, A);
    assert_eq!(shares, 0);
    assert_eq!(refund, 100); // 1:1 quote refund, nothing stranded
    assert!(!queue.has_pending(A));
    assert_eq!(queue.pending_quote(0), 0);

    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun claim_before_settle_aborts() {
    let (mut queue, test) = fresh();
    dq::record(&mut queue, A, 100);
    let (_, _) = dq::claim(&mut queue, A); // round_id 0 == current 0, not settled
    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun cancel_after_settle_aborts() {
    let (mut queue, test) = fresh();
    dq::record(&mut queue, A, 100);
    dq::settle(&mut queue, 100);
    dq::cancel(&mut queue, A); // EDepositSettled
    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun record_with_stale_entry_aborts() {
    let (mut queue, test) = fresh();
    dq::record(&mut queue, A, 100);
    dq::settle(&mut queue, 100); // A's entry is now from a settled round
    dq::record(&mut queue, A, 50); // EAlreadyQueued — must claim first
    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun zero_amount_record_aborts() {
    let (mut queue, test) = fresh();
    dq::record(&mut queue, A, 0); // EZeroAmount
    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun cancel_without_deposit_aborts() {
    let (mut queue, test) = fresh();
    dq::cancel(&mut queue, A); // ENoDeposit
    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun claim_without_deposit_aborts() {
    let (mut queue, test) = fresh();
    let (_, _) = dq::claim(&mut queue, A); // ENoDeposit
    queue.destroy_for_testing();
    end(test);
}
