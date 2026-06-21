/// Arena call state and PLP bond custody.
module arena::call;

use sui::{
    balance::Balance,
    coin::{Self, Coin},
    object::{Self, ID, UID},
    transfer,
};

use deepbook_predict::plp::PLP;

const STATUS_ACTIVE: u8 = 0;
const STATUS_SETTLED: u8 = 1;
const STATUS_BOND_CLAIMED: u8 = 2;

#[error]
const EInvalidCallTerms: vector<u8> = b"Call terms are invalid";

#[error]
const EEmptyBond: vector<u8> = b"Call must custody a non-zero PLP bond";

#[error]
const ECallSettled: vector<u8> = b"Call is already settled";

#[error]
const ECallNotSettled: vector<u8> = b"Call must be settled before claiming bond";

#[error]
const EWrongOracle: vector<u8> = b"Oracle does not match call";

#[error]
const EWrongPredict: vector<u8> = b"Predict object does not match call";

public struct Call<phantom Quote> has key {
    id: UID,
    creator: address,
    predict_id: ID,
    oracle_id: ID,
    strike: u64,
    is_up: bool,
    bond: Balance<PLP>,
    settled: bool,
}

public(package) fun new<Quote>(
    creator: address,
    predict_id: ID,
    oracle_id: ID,
    strike: u64,
    is_up: bool,
    bond: Coin<PLP>,
    ctx: &mut TxContext,
): Call<Quote> {
    assert_valid_call_terms(strike);
    let bond_plp_amount = bond.value();
    assert!(bond_plp_amount > 0, EEmptyBond);

    Call {
        id: object::new(ctx),
        creator,
        predict_id,
        oracle_id,
        strike,
        is_up,
        bond: bond.into_balance(),
        settled: false,
    }
}

public(package) fun share<Quote>(call: Call<Quote>) {
    transfer::share_object(call);
}

public(package) fun settle<Quote>(
    call: &mut Call<Quote>,
    oracle_id: ID,
    settlement_price: u64,
): bool {
    assert!(!call.settled, ECallSettled);
    assert!(call.oracle_id == oracle_id, EWrongOracle);

    let won = if (call.is_up) {
        settlement_price > call.strike
    } else {
        settlement_price <= call.strike
    };
    call.settled = true;
    won
}

public(package) fun assert_oracle<Quote>(call: &Call<Quote>, oracle_id: ID) {
    assert!(call.oracle_id == oracle_id, EWrongOracle);
}

public(package) fun assert_predict<Quote>(call: &Call<Quote>, predict_id: ID) {
    assert!(call.predict_id == predict_id, EWrongPredict);
}

public(package) fun claim_bond<Quote>(call: &mut Call<Quote>, ctx: &mut TxContext): Coin<PLP> {
    assert!(call.settled, ECallNotSettled);
    let bond_amount = call.bond.value();
    assert!(bond_amount > 0, EEmptyBond);
    let bond_balance = call.bond.split(bond_amount);

    coin::from_balance(bond_balance, ctx)
}

public fun status_active(): u8 { STATUS_ACTIVE }

public fun status_settled(): u8 { STATUS_SETTLED }

public fun status_bond_claimed(): u8 { STATUS_BOND_CLAIMED }

public fun id<Quote>(call: &Call<Quote>): ID { call.id.to_inner() }

public fun creator<Quote>(call: &Call<Quote>): address { call.creator }

public fun predict_id<Quote>(call: &Call<Quote>): ID { call.predict_id }

public fun oracle_id<Quote>(call: &Call<Quote>): ID { call.oracle_id }

public fun strike<Quote>(call: &Call<Quote>): u64 { call.strike }

public fun is_up<Quote>(call: &Call<Quote>): bool { call.is_up }

public fun bond_plp_amount<Quote>(call: &Call<Quote>): u64 { call.bond.value() }

public fun settled<Quote>(call: &Call<Quote>): bool { call.settled }

public fun status<Quote>(call: &Call<Quote>): u8 {
    if (!call.settled) {
        STATUS_ACTIVE
    } else if (call.bond.value() > 0) {
        STATUS_SETTLED
    } else {
        STATUS_BOND_CLAIMED
    }
}

fun assert_valid_call_terms(strike: u64) {
    assert!(strike > 0, EInvalidCallTerms);
}
