import { describe, expect, test } from "bun:test"

import { parseCliOptions } from "./cli.ts"

describe("parseCliOptions", () => {
  test("defaults to auto / all / once", () => {
    expect(parseCliOptions([])).toEqual({
      action: "auto",
      dryRun: false,
      products: ["all"],
      watch: false,
    })
  })

  test("parses an action, a single product, dry-run", () => {
    expect(parseCliOptions(["--start", "--run-hedged-plp", "--dry-run"])).toEqual({
      action: "start",
      dryRun: true,
      products: ["hedged_plp"],
      watch: false,
    })
  })

  test("collects multiple explicit products", () => {
    expect(parseCliOptions(["--run-hedged-plp", "--run-range-ladder"]).products).toEqual([
      "hedged_plp",
      "range_ladder",
    ])
  })

  test("--run-all wins over individual product flags", () => {
    expect(parseCliOptions(["--run-all", "--run-hedged-plp"]).products).toEqual(["all"])
  })

  test("sets watch", () => {
    expect(parseCliOptions(["--watch"]).watch).toBe(true)
  })

  test("rejects two action flags", () => {
    expect(() => parseCliOptions(["--start", "--settle"])).toThrow("only one action flag")
  })

  test("rejects --watch with --once", () => {
    expect(() => parseCliOptions(["--watch", "--once"])).toThrow("either --watch or --once")
  })
})
