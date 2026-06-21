/// Arena facade for call cards, PLP bonds, and provenance events.
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

const RECLAIM_GRACE_MS: u64 = 604_800_000; // 7 days after expiry

#[error]
const EOracleNotSettled: vector<u8> = b"Oracle has not settled yet";

#[error]
const EReclaimTooEarly: vector<u8> = b"Bond can only be reclaimed after the expiry grace period";

public struct ARENA has drop {}

public struct Arena has key {
    id: UID,
    total_calls: u64,
    min_bond_quote_amount: u64,
}

public struct ArenaAdminCap has key, store {
    id: UID,
}

public struct ArenaCreated has copy, drop {
    arena_id: ID,
    admin_cap_id: ID,
}

public struct ArenaConfigUpdated has copy, drop {
    arena_id: ID,
}

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

public struct CallBacked<phantom Quote> has copy, drop {
    call_id: ID,
    participant: address,
    manager_id: ID,
    cost: u64,
    refund_amount: u64,
    quantity: u64,
    recorded_at_ms: u64,
}

public struct CallFaded<phantom Quote> has copy, drop {
    call_id: ID,
    participant: address,
    manager_id: ID,
    cost: u64,
    refund_amount: u64,
    quantity: u64,
    recorded_at_ms: u64,
}

public struct CreatorBondClaimed<phantom Quote> has copy, drop {
    call_id: ID,
    oracle_id: ID,
    bond_plp_amount: u64,
    claimed_at_ms: u64,
}

public struct CreatorBondReclaimed<phantom Quote> has copy, drop {
    call_id: ID,
    bond_plp_amount: u64,
    reclaimed_at_ms: u64,
}

fun init(otw: ARENA, ctx: &mut TxContext) {
    transfer::public_transfer(package::claim(otw, ctx), ctx.sender());
}

#[test_only]
public fun publisher_for_testing(ctx: &mut TxContext): Publisher {
    package::claim(ARENA {}, ctx)
}

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

public fun set_config(
    arena: &mut Arena,
    _cap: &ArenaAdminCap,
    min_bond_quote_amount: u64,
) {
    arena.min_bond_quote_amount = min_bond_quote_amount;

    event::emit(ArenaConfigUpdated { arena_id: arena.id() });
}

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
    predict.get_trade_amounts(oracle, key, 1, clock);

    let bond_quote_amount = bond_payment.value();
    assert_valid_bond(arena, bond_quote_amount);
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

public fun claim_bond<Quote>(
    call: &mut Call<Quote>,
    oracle: &OracleSVI,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<PLP> {
    assert!(ctx.sender() == call.creator(), ENotCreator);
    call.assert_oracle(oracle.id());
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

fun assert_valid_bond(arena: &Arena, bond_quote_amount: u64) {
    assert!(bond_quote_amount >= arena.min_bond_quote_amount, EInvalidBond);
}

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
