/// Share-currency one-time witness for the Bullish Upside strategy.
///
/// Publishing this module mints the `BUP` currency and hands the treasury to the
/// publisher, who passes it to `strategy::create_strategy`. The strategy then
/// owns the treasury and is the sole minter/burner of BUP shares.
module bullish_upside_strategy::bup;

use sui::coin;

/// One-time witness for the `BUP` strategy-share currency.
public struct BUP has drop {}

/// Publishes the `BUP` share currency (freezing its metadata) and transfers the
/// treasury cap to the publisher to bootstrap a strategy.
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
