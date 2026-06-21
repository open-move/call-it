// Known Predict Move aborts that the start-round candidate search treats as
// "not quotable/mintable right now" — i.e. skip this candidate and try the next
// rather than surfacing the failure. Matching is on the simulation error text
// (module function + abort code), centralized here so the fragile string checks
// live in one documented place.

function matchesAbort(error: string | undefined, fnFragment: string, code: number): boolean {
  return error !== undefined && error.includes(fnFragment) && error.includes(`abort code: ${code}`)
}

/// `predict::assert_mintable_ask` rejected the ask price as outside the oracle's
/// mintable bounds.
export function isAskOutOfMintableBounds(error: string | undefined): boolean {
  return matchesAbort(error, "assert_mintable_ask", 7)
}

/// The oracle could not produce a quote (`pricing_config::quote_spread_from_fair_price`).
export function isQuoteUnavailable(error: string | undefined): boolean {
  return matchesAbort(error, "pricing_config::quote_spread_from_fair_price", 1)
}
