#[test_only]
module shield_strategy::test_quote;

use std::unit_test::destroy;
use sui::coin_registry::{Self, Currency};

public struct TEST_QUOTE has drop {}

public fun create_currency(ctx: &mut TxContext): Currency<TEST_QUOTE> {
    let (builder, treasury_cap) = coin_registry::new_currency_with_otw(
        TEST_QUOTE {},
        6,
        b"TQ".to_string(),
        b"Test Quote".to_string(),
        b"CallIt strategy test quote asset".to_string(),
        b"".to_string(),
        ctx,
    );
    let (currency, metadata_cap) = builder.finalize_unwrap_for_testing(ctx);
    destroy(metadata_cap);
    destroy(treasury_cap);
    currency
}
