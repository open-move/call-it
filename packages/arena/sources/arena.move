/// Arena facade for launching directional calls on DeepBook Predict markets.
///
/// The Arena is where creators launch "calls": a directional bet (up/down vs. a
/// strike) on a Predict market, collateralized by a PLP bond the creator supplies
/// into Predict and escrows in the `Call`. Others then `back` (agree) or `fade`
/// (disagree) by minting Predict positions through this facade.
///
/// Settlement is entirely off this package: the Predict oracle is the single
/// source of truth, and there is no on-chain call-level settle step. Once the
/// oracle has settled, the creator `claim`s the bond back; if the oracle never
/// settles, the creator can `reclaim` it after the expiry grace period. Backers
/// and faders settle their own Predict positions directly against Predict.
///
/// This module is a thin facade: the `Arena` object holds only global config
/// (call count, minimum bond), each `Call` lives in `arena::call`, and all
/// market mechanics (pricing, minting, settlement) belong to Predict. Its job is
/// to wire those together and emit the provenance events the indexer consumes.
module arena::arena;

use sui::{
    clock::Clock,
    coin::{Self, Coin},
    event,
    object::{Self, ID, UID},
    package::{Self, Publisher},
    transfer,
};

use deepbook_predict::{
    market_key,
    oracle::{Self, OracleSVI},
    plp::PLP,
    predict::{Self, Predict},
    predict_manager::PredictManager,
};

use arena::call::{Self, Call};

/// 7 days after expiry: how long a creator must wait before reclaiming a bond
/// from a call whose oracle never settled.
const RECLAIM_GRACE_MS: u64 = 604_800_000;

#[error]
const EInvalidBond: vector<u8> = b"PLP bond quote notional is below the required amount";

#[error]
const EOracleNotActive: vector<u8> = b"Call oracle must be active";

#[error]
const ETradeExceededPayment: vector<u8> = b"Predict mint exceeded supplied payment";

#[error]
const EWrongPublisher: vector<u8> = b"Publisher does not belong to the Arena module";

#[error]
const ENotCreator: vector<u8> = b"Only the call creator can claim the bond";

#[error]
const EOracleNotSettled: vector<u8> = b"Oracle has not settled yet";

#[error]
const EReclaimTooEarly: vector<u8> = b"Bond can only be reclaimed after the expiry grace period";

/// One-time witness used to claim the package `Publisher` at init.
public struct ARENA has drop {}

/// The shared arena object. One per deployment; holds global config only.
public struct Arena has key {
    id: UID,
    /// Lifetime count of calls launched through this arena.
    total_calls: u64,
    /// Floor on a call's bond, measured in quote notional supplied at launch.
    min_bond_quote_amount: u64,
}

/// Admin capability minted at bootstrap; gates `set_config`.
public struct ArenaAdminCap has key, store {
    id: UID,
}

/// Emitted once at bootstrap. Indexer: record the arena and its admin cap ids.
public struct ArenaCreated has copy, drop {
    arena_id: ID,
    admin_cap_id: ID,
}

/// Emitted when admin changes config. Indexer: re-read `min_bond_quote_amount`
/// from the `Arena` object (the new value is not carried on the event).
public struct ArenaConfigUpdated has copy, drop {
    arena_id: ID,
}

/// Emitted when a call is launched. Indexer: index the new call by `call_id`
/// with its full market terms and the creator's bond size.
public struct CallLaunched<phantom Quote> has copy, drop {
    arena_id: ID,
    call_id: ID,
    creator: address,
    predict_id: ID,
    oracle_id: ID,
    expiry: u64,
    strike: u64,
    is_up: bool,
    bond_plp_amount: u64,
    created_at_ms: u64,
}

/// Emitted when a participant backs a call (agrees with the creator's direction).
/// Indexer: record the participant's filled quantity and the `cost`/`refund`
/// split of their payment for that call.
public struct CallBacked<phantom Quote> has copy, drop {
    call_id: ID,
    participant: address,
    manager_id: ID,
    cost: u64,
    refund_amount: u64,
    quantity: u64,
    recorded_at_ms: u64,
}

/// Emitted when a participant fades a call (takes the opposite direction).
/// Mirror of `CallBacked` for the inverted market side.
public struct CallFaded<phantom Quote> has copy, drop {
    call_id: ID,
    participant: address,
    manager_id: ID,
    cost: u64,
    refund_amount: u64,
    quantity: u64,
    recorded_at_ms: u64,
}

/// Emitted when the creator claims the bond after the oracle has settled.
/// Indexer: mark the call's bond as claimed (settled path).
public struct CreatorBondClaimed<phantom Quote> has copy, drop {
    call_id: ID,
    oracle_id: ID,
    bond_plp_amount: u64,
    claimed_at_ms: u64,
}

/// Emitted when the creator reclaims the bond after the expiry grace because the
/// oracle never settled. Indexer: mark the call's bond as claimed (reclaim path).
public struct CreatorBondReclaimed<phantom Quote> has copy, drop {
    call_id: ID,
    bond_plp_amount: u64,
    reclaimed_at_ms: u64,
}

/// Claim the package `Publisher` and hand it to the publisher, who then calls
/// `bootstrap` to stand up the arena.
fun init(otw: ARENA, ctx: &mut TxContext) {
    transfer::public_transfer(package::claim(otw, ctx), ctx.sender());
}

#[test_only]
public fun publisher_for_testing(ctx: &mut TxContext): Publisher {
    package::claim(ARENA {}, ctx)
}

/// Stand up the shared arena from the package `Publisher`. Burns the publisher
/// (so this can only run once), shares the `Arena`, and returns the admin cap.
/// Aborts unless `publisher` belongs to this module.
public fun bootstrap(
    publisher: Publisher,
    min_bond_quote_amount: u64,
    ctx: &mut TxContext,
): ArenaAdminCap {
    assert!(publisher.from_module<ARENA>(), EWrongPublisher);
    publisher.burn();

    let arena = Arena {
        id: object::new(ctx),
        total_calls: 0,
        min_bond_quote_amount,
    };

    let admin_cap = ArenaAdminCap { id: object::new(ctx) };

    event::emit(ArenaCreated {
        arena_id: arena.id.to_inner(),
        admin_cap_id: admin_cap.id.to_inner(),
    });

    transfer::share_object(arena);
    admin_cap
}

/// Update the minimum bond. Admin-only (holding `ArenaAdminCap` is the gate).
public fun set_config(
    arena: &mut Arena,
    _cap: &ArenaAdminCap,
    min_bond_quote_amount: u64,
) {
    arena.min_bond_quote_amount = min_bond_quote_amount;

    event::emit(ArenaConfigUpdated { arena_id: arena.id() });
}

/// Launch a directional call on a Predict market. The caller becomes the creator.
///
/// Preconditions: the oracle must be active, `strike`/`is_up` must form a valid
/// market key (probed via `get_trade_amounts`), and `bond_payment` must meet the
/// arena minimum. The payment is supplied into Predict for PLP, which is escrowed
/// in a freshly shared `Call`. Emits `CallLaunched`.
public fun launch_call<Quote>(
    arena: &mut Arena,
    predict: &mut Predict,
    oracle: &OracleSVI,
    bond_payment: Coin<Quote>,
    strike: u64,
    is_up: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(oracle.status(clock) == oracle::status_active(), EOracleNotActive);
    let key = market_key::new(oracle.id(), oracle.expiry(), strike, is_up);
    // Probe the market: aborts if the key is off-grid / not tradeable.
    predict.get_trade_amounts(oracle, key, 1, clock);

    let bond_quote_amount = bond_payment.value();
    assert_valid_bond(arena, bond_quote_amount);
    // Convert the quote bond into PLP; the call custodies the PLP, not the quote.
    let bond = predict.supply<Quote>(bond_payment, clock, ctx);
    let bond_plp_amount = bond.value();

    let creator = ctx.sender();
    let call = call::new<Quote>(
        creator,
        object::id(predict),
        oracle.id(),
        oracle.expiry(),
        strike,
        is_up,
        bond,
        ctx,
    );
    let call_id = call.id();
    let created_at_ms = clock.timestamp_ms();
    arena.total_calls = arena.total_calls + 1;
    call::share(call);

    event::emit(CallLaunched<Quote> {
        arena_id: arena.id(),
        call_id,
        creator,
        predict_id: object::id(predict),
        oracle_id: oracle.id(),
        expiry: oracle.expiry(),
        strike,
        is_up,
        bond_plp_amount,
        created_at_ms,
    });
}

/// Back a call: mint a Predict position on the *same* side as the creator.
/// Asserts the supplied oracle/predict match the call, mints `quantity` at the
/// call's `(strike, is_up)` key, and returns the unspent payment as a refund.
/// Anyone may call. Emits `CallBacked`.
public fun back_call<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    call: &Call<Quote>,
    payment: Coin<Quote>,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    call.assert_oracle(oracle.id());
    call.assert_predict(object::id(predict));
    let key = market_key::new(oracle.id(), oracle.expiry(), call.strike(), call.is_up());
    let (cost, refund) = mint_position<Quote>(
        predict,
        manager,
        oracle,
        key,
        payment,
        quantity,
        clock,
        ctx,
    );
    event::emit(CallBacked<Quote> {
        call_id: call.id(),
        participant: ctx.sender(),
        manager_id: object::id(manager),
        cost,
        refund_amount: refund.value(),
        quantity,
        recorded_at_ms: clock.timestamp_ms(),
    });

    refund
}

/// Fade a call: mint a Predict position on the *opposite* side (`!is_up`).
/// Otherwise identical to `back_call`. Anyone may call. Emits `CallFaded`.
public fun fade_call<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    call: &Call<Quote>,
    payment: Coin<Quote>,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    call.assert_oracle(oracle.id());
    call.assert_predict(object::id(predict));
    let key = market_key::new(oracle.id(), oracle.expiry(), call.strike(), !call.is_up());
    let (cost, refund) = mint_position<Quote>(
        predict,
        manager,
        oracle,
        key,
        payment,
        quantity,
        clock,
        ctx,
    );
    event::emit(CallFaded<Quote> {
        call_id: call.id(),
        participant: ctx.sender(),
        manager_id: object::id(manager),
        cost,
        refund_amount: refund.value(),
        quantity,
        recorded_at_ms: clock.timestamp_ms(),
    });

    refund
}

/// Claim the bond back after settlement. The creator gets the full PLP bond
/// regardless of outcome — the call holds no participant stakes to redistribute,
/// so won/lost is settled purely on each party's own Predict positions.
///
/// Preconditions: caller is the creator, the supplied oracle matches the call,
/// and the oracle has settled (`settlement_price` is set). Drains the bond and
/// emits `CreatorBondClaimed`.
public fun claim_bond<Quote>(
    call: &mut Call<Quote>,
    oracle: &OracleSVI,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<PLP> {
    assert!(ctx.sender() == call.creator(), ENotCreator);
    call.assert_oracle(oracle.id());
    // Oracle-settled gating: the bond is only releasable once Predict has a
    // settlement price for this market.
    assert!(oracle.settlement_price().is_some(), EOracleNotSettled);
    let call_id = call.id();
    let bond_plp_amount = call.bond_plp_amount();
    let bond = call.withdraw_bond(ctx);

    event::emit(CreatorBondClaimed<Quote> {
        call_id,
        oracle_id: oracle.id(),
        bond_plp_amount,
        claimed_at_ms: clock.timestamp_ms(),
    });

    bond
}

/// Reclaim the bond when the oracle never settled. This is the escape hatch for a
/// stuck market: no oracle is required, only that the expiry grace has elapsed.
///
/// Preconditions: caller is the creator and `now >= expiry + RECLAIM_GRACE_MS`.
/// Drains the bond and emits `CreatorBondReclaimed`.
public fun reclaim_bond<Quote>(
    call: &mut Call<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<PLP> {
    assert!(ctx.sender() == call.creator(), ENotCreator);
    assert!(clock.timestamp_ms() >= call.expiry() + RECLAIM_GRACE_MS, EReclaimTooEarly);
    let call_id = call.id();
    let bond_plp_amount = call.bond_plp_amount();
    let bond = call.withdraw_bond(ctx);

    event::emit(CreatorBondReclaimed<Quote> {
        call_id,
        bond_plp_amount,
        reclaimed_at_ms: clock.timestamp_ms(),
    });

    bond
}

public fun id(arena: &Arena): ID { arena.id.to_inner() }

public fun admin_cap_id(cap: &ArenaAdminCap): ID { cap.id.to_inner() }

public fun min_bond_quote_amount(arena: &Arena): u64 { arena.min_bond_quote_amount }

public fun total_calls(arena: &Arena): u64 { arena.total_calls }

/// Abort unless the bond's quote notional meets the arena minimum.
fun assert_valid_bond(arena: &Arena, bond_quote_amount: u64) {
    assert!(bond_quote_amount >= arena.min_bond_quote_amount, EInvalidBond);
}

/// Mint a Predict position for `quantity` at `key`, funded by `payment`.
///
/// Measures the manager's quote balance before and after to split the payment
/// into the actual `cost` and an unspent `refund`. The deposit-then-mint dance
/// means the manager temporarily holds the full payment; `ETradeExceededPayment`
/// guards the invariant that minting never costs more than was deposited (the
/// post-mint balance must not dip below the pre-deposit balance). Returns
/// `(cost, refund)`.
fun mint_position<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: market_key::MarketKey,
    payment: Coin<Quote>,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (u64, Coin<Quote>) {
    let balance_before = manager.balance<Quote>();
    manager.deposit<Quote>(payment, ctx);
    let balance_after_deposit = manager.balance<Quote>();
    predict.mint<Quote>(manager, oracle, key, quantity, clock, ctx);
    let balance_after_mint = manager.balance<Quote>();
    assert!(balance_after_mint >= balance_before, ETradeExceededPayment);
    let cost = balance_after_deposit - balance_after_mint;
    let refund_amount = balance_after_mint - balance_before;
    let refund = if (refund_amount > 0) {
        manager.withdraw<Quote>(refund_amount, ctx)
    } else {
        coin::zero(ctx)
    };

    (cost, refund)
}
