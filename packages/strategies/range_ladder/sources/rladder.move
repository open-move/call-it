module range_ladder_strategy::rladder;

use sui::coin;

public struct RLADDER has drop {}

#[allow(deprecated_usage)]
fun init(witness: RLADDER, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"rLADDER",
        b"Range Ladder Strategy Share",
        b"Share token for the Range Ladder strategy.",
        option::none(),
        ctx,
    );

    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}
