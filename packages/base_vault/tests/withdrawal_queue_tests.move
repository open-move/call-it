#[test_only]
module base_vault::withdrawal_queue_tests;

use base_vault::withdrawal_queue::{Self as wq, WithdrawalQueue};
use std::unit_test::assert_eq;
use sui::test_scenario::{begin, end};

const A: address = @0xA;
const B: address = @0xB;
const C: address = @0xC;

fun fresh(): (WithdrawalQueue, sui::test_scenario::Scenario) {
    let mut test = begin(A);
    let queue = wq::new(test.ctx());
    (queue, test)
}

#[test]
fun request_settle_claim_single_user() {
    let (mut queue, test) = fresh();

    wq::request(&mut queue, A, 100);
    assert_eq!(queue.current_round(), 0);
    assert_eq!(queue.pending_shares(0), 100);
    assert!(queue.has_request(A));
    assert!(!queue.is_settled(A));

    // Strategy reserves 500 base shares pro-rata for this round's 100 shares.
    let burned = wq::settle(&mut queue, 500);
    assert_eq!(burned, 100);
    assert_eq!(queue.current_round(), 1);
    assert_eq!(queue.reserved_base(0), 500);
    assert!(queue.is_settled(A));

    let owed = wq::claim(&mut queue, A);
    assert_eq!(owed, 500);
    assert!(!queue.has_request(A));
    // Fully drained round entries are cleaned up.
    assert_eq!(queue.pending_shares(0), 0);
    assert_eq!(queue.reserved_base(0), 0);

    queue.destroy_for_testing();
    end(test);
}

#[test]
fun two_users_split_reserve_pro_rata() {
    let (mut queue, test) = fresh();

    wq::request(&mut queue, A, 100);
    wq::request(&mut queue, B, 300);
    assert_eq!(queue.pending_shares(0), 400);

    wq::settle(&mut queue, 800);

    let owed_a = wq::claim(&mut queue, A); // 800 * 100/400 = 200
    assert_eq!(owed_a, 200);
    let owed_b = wq::claim(&mut queue, B); // remainder: 600 * 300/300 = 600
    assert_eq!(owed_b, 600);
    assert_eq!(owed_a + owed_b, 800);

    queue.destroy_for_testing();
    end(test);
}

#[test]
fun last_claimant_sweeps_rounding_dust() {
    let (mut queue, test) = fresh();

    // 3 equal claimants against a reserve that doesn't divide evenly (100/3).
    wq::request(&mut queue, A, 1);
    wq::request(&mut queue, B, 1);
    wq::request(&mut queue, C, 1);
    wq::settle(&mut queue, 100);

    let a = wq::claim(&mut queue, A); // 100*1/3 = 33
    let b = wq::claim(&mut queue, B); // 67*1/2 = 33
    let c = wq::claim(&mut queue, C); // remainder = 34
    assert_eq!(a, 33);
    assert_eq!(b, 33);
    assert_eq!(c, 34);
    assert_eq!(a + b + c, 100); // nothing stranded

    queue.destroy_for_testing();
    end(test);
}

#[test]
fun cancel_before_settle_returns_shares() {
    let (mut queue, test) = fresh();

    wq::request(&mut queue, A, 100);
    let refunded = wq::cancel(&mut queue, A);
    assert_eq!(refunded, 100);
    assert!(!queue.has_request(A));
    assert_eq!(queue.pending_shares(0), 0);

    queue.destroy_for_testing();
    end(test);
}

#[test]
fun request_after_claim_attaches_to_new_round() {
    let (mut queue, test) = fresh();

    wq::request(&mut queue, A, 100);
    wq::settle(&mut queue, 100); // round 0 -> 1
    wq::claim(&mut queue, A);

    // Re-requesting now lands in round 1.
    wq::request(&mut queue, A, 50);
    assert_eq!(queue.request_round(A), 1);
    assert_eq!(queue.pending_shares(1), 50);

    queue.destroy_for_testing();
    end(test);
}

#[test]
fun sweep_stale_after_grace_returns_reserve() {
    let (mut queue, test) = fresh();

    wq::request(&mut queue, A, 100);
    wq::settle(&mut queue, 100); // round 0 -> 1
    wq::settle(&mut queue, 0); // round 1 -> 2 (no pending)

    // grace = 2: current_round(2) - round_id(0) >= 2.
    let recovered = wq::sweep_stale(&mut queue, A, 2);
    assert_eq!(recovered, 100);
    assert!(!queue.has_request(A));

    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun double_request_aborts() {
    let (mut queue, test) = fresh();
    wq::request(&mut queue, A, 100);
    wq::request(&mut queue, A, 50); // EAlreadyQueued
    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun zero_share_request_aborts() {
    let (mut queue, test) = fresh();
    wq::request(&mut queue, A, 0); // EZeroShares
    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun claim_before_settle_aborts() {
    let (mut queue, test) = fresh();
    wq::request(&mut queue, A, 100);
    wq::claim(&mut queue, A); // ERequestNotSettled (round_id 0 == current_round 0)
    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun cancel_after_settle_aborts() {
    let (mut queue, test) = fresh();
    wq::request(&mut queue, A, 100);
    wq::settle(&mut queue, 100);
    wq::cancel(&mut queue, A); // ERequestSettled
    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun sweep_before_grace_aborts() {
    let (mut queue, test) = fresh();
    wq::request(&mut queue, A, 100);
    wq::settle(&mut queue, 100); // round -> 1; elapsed 1 < grace 2
    wq::sweep_stale(&mut queue, A, 2); // ENotStale
    queue.destroy_for_testing();
    end(test);
}

#[test, expected_failure]
fun claim_without_request_aborts() {
    let (mut queue, test) = fresh();
    wq::claim(&mut queue, A); // ENoRequest
    queue.destroy_for_testing();
    end(test);
}
