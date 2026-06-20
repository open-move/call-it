module hedged_plp_strategy::hplp;

use sui::coin;

public struct HPLP has drop {}

#[allow(deprecated_usage)]
fun init(witness: HPLP, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"hPLP",
        b"Hedged PLP Strategy Share",
        b"Share token for the Hedged PLP strategy.",
        option::none(),
        ctx,
    );

    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}
