import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { normalizeSuiRpcUrl } from "../src/config.ts"

describe("normalizeSuiRpcUrl", () => {
  it("accepts bare gRPC host entries", () => {
    assert.equal(
      normalizeSuiRpcUrl("sui-testnet-grpc.publicnode.com:443"),
      "https://sui-testnet-grpc.publicnode.com"
    )
  })

  it("normalizes http port 443 endpoints to https", () => {
    assert.equal(
      normalizeSuiRpcUrl("http://sui-testnet.public.blastapi.io:443/"),
      "https://sui-testnet.public.blastapi.io"
    )
  })
})
