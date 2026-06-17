/// Arena facade for creator profiles, call cards, PLP bonds, and provenance events.
module arena::arena;

use sui::{
    clock::Clock,
    coin::{Self, Coin},
    derived_object,
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

use arena::{
    call_card::{Self, CallCard},
    profile::{Self, CreatorProfile, CreatorProfileCap},
};

const MAX_METADATA_HASH_BYTES: u64 = 256;

#[error]
const EInvalidBond: vector<u8> = b"PLP bond quote notional is below the required amount";

#[error]
const EOracleNotActive: vector<u8> = b"Call oracle must be active";

#[error]
const EInvalidMetadata: vector<u8> = b"Call metadata hash must be non-empty and bounded";

#[error]
const ETradeExceededPayment: vector<u8> = b"Predict mint exceeded supplied payment";

#[error]
const EWrongPublisher: vector<u8> = b"Publisher does not belong to the Arena module";

public struct ARENA has drop {}

public struct ArenaRoot has key {
    id: UID,
}

public struct ArenaKey() has copy, drop, store;

public struct ArenaAdminCapKey() has copy, drop, store;

public struct Arena has key {
    id: UID,
    min_bond_quote_amount: u64,
    total_calls: u64,
    total_profiles: u64,
    total_settled_calls: u64,
}

public struct ArenaAdminCap has key, store {
    id: UID,
}

public struct ArenaCreated has copy, drop {
    root_id: ID,
    arena_id: ID,
    admin_cap_id: ID,
}

public struct ArenaConfigUpdated has copy, drop {
    arena_id: ID,
}

public struct CreatorProfileCreated has copy, drop {
    profile_id: ID,
    creator_cap_id: ID,
    created_at_ms: u64,
}

public struct CallLaunched<phantom Quote> has copy, drop {
    arena_id: ID,
    call_id: ID,
    call_index: u64,
    metadata_hash: vector<u8>,
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

public struct CallSettled<phantom Quote> has copy, drop {
    call_id: ID,
    settled_at_ms: u64,
}

public struct CreatorBondClaimed<phantom Quote> has copy, drop {
    call_id: ID,
    bond_plp_amount: u64,
    claimed_at_ms: u64,
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

    let mut root = ArenaRoot { id: object::new(ctx) };
    let arena_id = derived_object::claim(&mut root.id, ArenaKey());

    let arena = Arena {
        id: arena_id,
        total_calls: 0,
        total_profiles: 0,
        total_settled_calls: 0,
        min_bond_quote_amount,
    };

    let admin_cap = ArenaAdminCap {
        id: derived_object::claim(&mut root.id, ArenaAdminCapKey())
    };

    event::emit(ArenaCreated {
        root_id: root.id.to_inner(),
        arena_id: arena.id.to_inner(),
        admin_cap_id: admin_cap.id.to_inner(),
    });

    transfer::share_object(root);
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

public fun create_profile(
    arena: &mut Arena,
    metadata_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): CreatorProfileCap {
    let (profile, profile_cap) = profile::new(
        ctx.sender(),
        metadata_hash,
        clock,
        ctx,
    );

    arena.total_profiles = arena.total_profiles + 1;

    event::emit(CreatorProfileCreated {
        profile_id: profile.id(),
        creator_cap_id: profile_cap.cap_id(),
        created_at_ms: profile.created_at_ms(),
    });

    profile::share(profile);
    profile_cap
}

public fun launch_call<Quote>(
    root: &mut ArenaRoot,
    arena: &mut Arena,
    profile: &mut CreatorProfile,
    cap: &CreatorProfileCap,
    predict: &mut Predict,
    oracle: &OracleSVI,
    bond_payment: Coin<Quote>,
    strike: u64,
    is_up: bool,
    metadata_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_valid_metadata(&metadata_hash);
    profile.assert_creator(cap, ctx.sender());
    assert!(oracle.status(clock) == oracle::status_active(), EOracleNotActive);
    let key = market_key::new(oracle.id(), oracle.expiry(), strike, is_up);
    predict.get_trade_amounts(oracle, key, 1, clock);

    let bond_quote_amount = bond_payment.value();
    assert_valid_bond(arena, bond_quote_amount);
    let bond = predict.supply<Quote>(bond_payment, clock, ctx);

    let call_index = arena.total_calls;
    let call_card = call_card::new<Quote>(
        &mut root.id,
        call_index,
        profile.id(),
        object::id(predict),
        oracle.id(),
        strike,
        is_up,
        bond,
    );
    let call_id = call_card.id();
    let created_at_ms = clock.timestamp_ms();
    arena.total_calls = arena.total_calls + 1;
    profile.increment_call_count();
    call_card::share(call_card);

    event::emit(CallLaunched<Quote> {
        arena_id: arena.id(),
        call_id,
        call_index,
        metadata_hash,
        created_at_ms,
    });
}

public fun back_call<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    call: &CallCard<Quote>,
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
    call: &CallCard<Quote>,
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

public fun settle_call<Quote>(
    arena: &mut Arena,
    profile: &mut CreatorProfile,
    oracle: &OracleSVI,
    call: &mut CallCard<Quote>,
    clock: &Clock,
) {
    profile.assert_profile_id(call.profile_id());
    let won = call.settle(oracle.id(), oracle.settlement_price().destroy_some());
    profile.record_settlement(won);
    arena.total_settled_calls = arena.total_settled_calls + 1;

    event::emit(CallSettled<Quote> {
        call_id: call.id(),
        settled_at_ms: clock.timestamp_ms(),
    });
}

public fun claim_bond<Quote>(
    profile: &CreatorProfile,
    cap: &CreatorProfileCap,
    call: &mut CallCard<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<PLP> {
    profile.assert_creator(cap, ctx.sender());
    profile.assert_profile_id(call.profile_id());
    let call_id = call.id();
    let bond_plp_amount = call.bond_plp_amount();
    let bond = call.claim_bond(ctx);

    event::emit(CreatorBondClaimed<Quote> {
        call_id,
        bond_plp_amount,
        claimed_at_ms: clock.timestamp_ms(),
    });

    bond
}

public fun id(arena: &Arena): ID { arena.id.to_inner() }

public fun root_id(root: &ArenaRoot): ID { root.id.to_inner() }

public fun derived_arena_address(root: &ArenaRoot): address {
    derived_object::derive_address(root.id.to_inner(), ArenaKey())
}

public fun derived_admin_cap_address(root: &ArenaRoot): address {
    derived_object::derive_address(root.id.to_inner(), ArenaAdminCapKey())
}

public fun derived_call_card_address(root: &ArenaRoot, call_index: u64): address {
    call_card::derived_address(root.id.to_inner(), call_index)
}

public fun admin_cap_id(cap: &ArenaAdminCap): ID { cap.id.to_inner() }

public fun min_bond_quote_amount(arena: &Arena): u64 { arena.min_bond_quote_amount }

public fun total_calls(arena: &Arena): u64 { arena.total_calls }

public fun total_profiles(arena: &Arena): u64 { arena.total_profiles }

public fun total_settled_calls(arena: &Arena): u64 { arena.total_settled_calls }

fun assert_valid_metadata(metadata_hash: &vector<u8>) {
    let metadata_length = metadata_hash.length();
    assert!(metadata_length > 0 && metadata_length <= MAX_METADATA_HASH_BYTES, EInvalidMetadata);
}

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
