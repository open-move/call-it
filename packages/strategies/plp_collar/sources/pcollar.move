/// Share currency for the managed PLP Collar strategy.
///
/// Publishes the `PCOLLAR` coin and hands its treasury to the publisher, who
/// then bootstraps a strategy via `strategy::create_strategy`. PCOLLAR is minted
/// on deposit and burned on withdraw against the strategy's NAV.
module plp_collar_strategy::pcollar;

use sui::coin;

/// One-time witness for the `PCOLLAR` strategy-share currency.
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
