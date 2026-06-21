module plp_collar_strategy::pcollar;

use sui::coin;

public struct PCOLLAR has drop {}

#[allow(deprecated_usage)]
fun init(witness: PCOLLAR, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"PCOLLAR",
        b"PLP Collar Strategy Share",
        b"Share token for the PLP Collar strategy.",
        option::none(),
        ctx,
    );

    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}
