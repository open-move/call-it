/// Share-coin currency for the Strangle strategy.
///
/// Defines the `STRANGLE` one-time witness and publishes the share currency at
/// package init. A STRANGLE coin is a NAV-proportional claim on the Strangle
/// strategy vault: depositors mint it, withdrawers/queue settlement burn it. The
/// treasury cap is handed to the publisher, who passes it into
/// `strategy::create_strategy` so the strategy owns minting/burning.
module strangle_strategy::strangle;

use sui::coin;

/// One-time witness for the `STRANGLE` share currency.
public struct STRANGLE has drop {}

/// Publishes the `STRANGLE` share currency, freezes its metadata, and transfers
/// the treasury cap to the publisher to bootstrap a strategy.
#[allow(deprecated_usage)]
fun init(witness: STRANGLE, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"STRANGLE",
        b"Strangle Strategy Share",
        b"Share token for the Strangle strategy.",
        option::none(),
        ctx,
    );

    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}
