/// Share-token currency for the Hedged PLP strategy.
///
/// `HPLP` is the one-time witness used to publish the strategy's share coin. The
/// `init` function creates the currency and hands the `TreasuryCap` to the
/// publisher, who passes it into `strategy::create_strategy` so the strategy
/// becomes the sole minter/burner of shares. The strategy prices shares against
/// its NAV; this module only defines the currency itself.
module hedged_plp_strategy::hplp;

use sui::coin;

/// One-time witness for the `HPLP` share currency.
public struct HPLP has drop {}

/// Publish the `HPLP` share currency and transfer its treasury to the publisher,
/// who then bootstraps the strategy via `strategy::create_strategy`.
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
