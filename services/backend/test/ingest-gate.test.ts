import { describe, expect, test } from "bun:test"

import { IngestGate } from "../src/ingest/gate.ts"

describe("IngestGate", () => {
  test("serializes exclusive work", async () => {
    const gate = new IngestGate()
    const order: string[] = []
    let releaseFirst: (() => void) | null = null

    const first = gate.runExclusive(async () => {
      order.push("first:start")
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      order.push("first:end")
    })

    const second = gate.runExclusive(async () => {
      order.push("second")
    })

    await Promise.resolve()
    expect(order).toEqual(["first:start"])
    if (releaseFirst === null) {
      throw new Error("first task did not start")
    }
    releaseFirst()
    await Promise.all([first, second])

    expect(order).toEqual(["first:start", "first:end", "second"])
  })
})
