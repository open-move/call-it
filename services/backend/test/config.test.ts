import { describe, expect, test } from "bun:test"

import { normalizeSuiRpcUrl } from "../src/config.ts"

describe("normalizeSuiRpcUrl", () => {
  test("accepts bare gRPC host entries", () => {
    expect(normalizeSuiRpcUrl("sui-testnet-grpc.publicnode.com:443")).toBe(
      "https://sui-testnet-grpc.publicnode.com"
    )
  })

  test("normalizes http port 443 endpoints to https", () => {
    expect(normalizeSuiRpcUrl("http://sui-testnet.public.blastapi.io:443/")).toBe(
      "https://sui-testnet.public.blastapi.io"
    )
  })
})
