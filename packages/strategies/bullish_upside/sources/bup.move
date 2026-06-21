module bullish_upside_strategy::bup;

use sui::coin;

public struct BUP has drop {}

#[allow(deprecated_usage)]
fun init(witness: BUP, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"BUP",
        b"Bullish Upside Strategy Share",
        b"Share token for the Bullish Upside strategy.",
        option::none(),
        ctx,
    );

    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}
