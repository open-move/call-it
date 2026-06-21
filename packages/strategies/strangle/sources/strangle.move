module strangle_strategy::strangle;

use sui::coin;

public struct STRANGLE has drop {}

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
