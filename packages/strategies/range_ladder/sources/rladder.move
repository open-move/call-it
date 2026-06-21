/// Share currency for the Range Ladder strategy.
///
/// Publishes the `RLADDER` coin and hands its `TreasuryCap` to the publisher,
/// who then bootstraps a `Strategy` via `strategy::create_strategy`. The
/// strategy mints `RLADDER` on deposit and burns it on withdraw; total supply
/// always equals the circulating strategy shares.
module range_ladder_strategy::rladder;

use sui::coin;

/// One-time witness for the `RLADDER` share currency.
public struct RLADDER has drop {}

/// Create the `RLADDER` currency, freeze its metadata, and transfer the treasury
/// to the publisher so it can seed a strategy.
#[allow(deprecated_usage)]
fun init(witness: RLADDER, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"RLADDER",
        b"Range Ladder Strategy Share",
        b"Share token for the Range Ladder strategy.",
        option::none(),
        ctx,
    );

    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}
