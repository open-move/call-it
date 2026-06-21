/// Arena call cards and PLP bond custody.
///
/// A `Call` is the on-chain card a creator launches over a single DeepBook
/// Predict market: it pins the market terms (predict object, oracle, expiry,
/// strike, direction) and escrows the creator's PLP bond inside its own
/// `Balance<PLP>`. The bond is the only value the call holds — backers and
/// faders mint their positions directly against Predict, not against the call.
///
/// There is no on-chain call-level settlement: the Predict oracle is the single
/// source of truth. Withdrawing the bond (claim after the oracle settles, or
/// reclaim after the expiry grace) drains the balance to zero, which is also how
/// the call advertises that the bond is gone — `status` and `is_bond_claimed`
/// are derived from `bond.value() == 0`, so the call carries no separate status
/// field to keep in sync.
module arena::call;

use sui::{
    balance::Balance,
    coin::{Self, Coin},
    object::{Self, ID, UID},
    transfer,
};

use deepbook_predict::plp::PLP;

/// Bond is still in custody; the call has not been claimed or reclaimed.
const STATUS_ACTIVE: u8 = 0;
/// Bond has been withdrawn (claimed after settlement or reclaimed after grace).
const STATUS_BOND_CLAIMED: u8 = 2;

#[error]
const EInvalidCallTerms: vector<u8> = b"Call terms are invalid";

#[error]
const EEmptyBond: vector<u8> = b"Call must custody a non-zero PLP bond";

#[error]
const EWrongOracle: vector<u8> = b"Oracle does not match call";

#[error]
const EWrongPredict: vector<u8> = b"Predict object does not match call";

/// A shared call card. `Quote` is the market's quote asset (phantom — the bond
/// is denominated in PLP, but the call is typed by quote so the facade can keep
/// its events and flows quote-parametric).
public struct Call<phantom Quote> has key {
    id: UID,
    /// Address allowed to claim/reclaim the bond.
    creator: address,
    /// The Predict object this call was launched against; back/fade must match.
    predict_id: ID,
    /// The oracle that settles this call; claim and back/fade must match.
    oracle_id: ID,
    /// Oracle expiry in ms; the reclaim grace is measured from here.
    expiry: u64,
    /// Strike price the market is struck at.
    strike: u64,
    /// Direction of the creator's call: `true` = up (above strike).
    is_up: bool,
    /// The creator's escrowed PLP bond. Drains to zero on claim/reclaim.
    bond: Balance<PLP>,
}

/// Construct a call from validated terms, taking custody of `bond`. Aborts on
/// invalid terms or an empty bond. Package-only: the arena facade is the sole
/// caller, after it has supplied the bond into Predict.
public(package) fun new<Quote>(
    creator: address,
    predict_id: ID,
    oracle_id: ID,
    expiry: u64,
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
        expiry,
        strike,
        is_up,
        bond: bond.into_balance(),
    }
}

/// Share the call so backers, faders, and the creator can reference it. Package-only.
public(package) fun share<Quote>(call: Call<Quote>) {
    transfer::share_object(call);
}

/// Abort unless `oracle_id` is the oracle this call was launched against.
public(package) fun assert_oracle<Quote>(call: &Call<Quote>, oracle_id: ID) {
    assert!(call.oracle_id == oracle_id, EWrongOracle);
}

/// Abort unless `predict_id` is the Predict object this call was launched against.
public(package) fun assert_predict<Quote>(call: &Call<Quote>, predict_id: ID) {
    assert!(call.predict_id == predict_id, EWrongPredict);
}

/// Drain the entire bond out of custody and hand it back as a coin. Aborts if
/// the bond is already empty (a second claim/reclaim), which is what makes the
/// withdraw idempotent-safe. Package-only: the facade gates *who* may call and
/// *when* (settled vs. grace) before invoking this.
public(package) fun withdraw_bond<Quote>(call: &mut Call<Quote>, ctx: &mut TxContext): Coin<PLP> {
    let bond_amount = call.bond.value();
    assert!(bond_amount > 0, EEmptyBond);
    let bond_balance = call.bond.split(bond_amount);

    coin::from_balance(bond_balance, ctx)
}

public fun status_active(): u8 { STATUS_ACTIVE }

public fun status_bond_claimed(): u8 { STATUS_BOND_CLAIMED }

public fun id<Quote>(call: &Call<Quote>): ID { call.id.to_inner() }

public fun creator<Quote>(call: &Call<Quote>): address { call.creator }

public fun predict_id<Quote>(call: &Call<Quote>): ID { call.predict_id }

public fun oracle_id<Quote>(call: &Call<Quote>): ID { call.oracle_id }

public fun expiry<Quote>(call: &Call<Quote>): u64 { call.expiry }

public fun strike<Quote>(call: &Call<Quote>): u64 { call.strike }

public fun is_up<Quote>(call: &Call<Quote>): bool { call.is_up }

public fun bond_plp_amount<Quote>(call: &Call<Quote>): u64 { call.bond.value() }

/// True once the bond has been withdrawn (balance drained to zero).
public fun is_bond_claimed<Quote>(call: &Call<Quote>): bool { call.bond.value() == 0 }

/// Derive the call's status from the bond balance — no stored status field.
public fun status<Quote>(call: &Call<Quote>): u8 {
    if (call.bond.value() == 0) { STATUS_BOND_CLAIMED } else { STATUS_ACTIVE }
}

fun assert_valid_call_terms(strike: u64) {
    assert!(strike > 0, EInvalidCallTerms);
}
