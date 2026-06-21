import { describe, expect, test } from "bun:test"

import { isAskOutOfMintableBounds, isQuoteUnavailable } from "./abort-codes.ts"

describe("isAskOutOfMintableBounds", () => {
  test("matches the mintable-ask abort (code 7)", () => {
    expect(
      isAskOutOfMintableBounds(
        "MoveAbort in 1st command, abort code: 7, in '0x..::predict::assert_mintable_ask'"
      )
    ).toBe(true)
  })

  test("does not match other aborts or undefined", () => {
    expect(isAskOutOfMintableBounds("abort code: 1, in '0x..::pricing_config::quote_spread_from_fair_price'")).toBe(false)
    expect(isAskOutOfMintableBounds("assert_mintable_ask but abort code: 3")).toBe(false)
    expect(isAskOutOfMintableBounds(undefined)).toBe(false)
  })
})

describe("isQuoteUnavailable", () => {
  test("matches the quote-spread abort (code 1)", () => {
    expect(
      isQuoteUnavailable("abort code: 1, in '0x..::pricing_config::quote_spread_from_fair_price'")
    ).toBe(true)
  })

  test("does not match the mintable-ask abort or undefined", () => {
    expect(isQuoteUnavailable("abort code: 7, in '0x..::predict::assert_mintable_ask'")).toBe(false)
    expect(isQuoteUnavailable(undefined)).toBe(false)
  })
})
