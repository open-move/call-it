/// A throwaway quote currency for the arena tests — stands in for DUSDC so the
/// suite can create a Predict deployment without a real coin registry entry.
#[test_only]
module arena::test_quote;

use std::unit_test::destroy;
use sui::coin_registry::{Self, Currency};

public struct TEST_QUOTE has drop {}

/// Build a finalized `Currency<TEST_QUOTE>`, discarding the treasury and metadata
/// caps the tests do not need.
public fun create_currency(ctx: &mut TxContext): Currency<TEST_QUOTE> {
    let (builder, treasury_cap) = coin_registry::new_currency_with_otw(
        TEST_QUOTE {},
        6,
        b"TQ".to_string(),
        b"Test Quote".to_string(),
        b"Arena test quote asset".to_string(),
        b"".to_string(),
        ctx,
    );
    let (currency, metadata_cap) = builder.finalize_unwrap_for_testing(ctx);
    destroy(metadata_cap);
    destroy(treasury_cap);
    currency
}
