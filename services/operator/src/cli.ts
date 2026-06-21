import type { TickAction } from "./strategy/engine.ts"

export type ProductSelection = "all" | "hedged_plp" | "range_ladder"

export interface CliOptions {
  action: TickAction
  dryRun: boolean
  products: ProductSelection[]
  watch: boolean
}

const ACTION_FLAGS: ReadonlyArray<readonly [string, TickAction]> = [
  ["--status", "status"],
  ["--start", "start"],
  ["--settle", "settle"],
  ["--realize", "realize"],
]

function parseAction(argv: string[]): TickAction {
  const selected = ACTION_FLAGS.filter(([flag]) => argv.includes(flag)).map(([, action]) => action)
  if (selected.length > 1) {
    throw new Error("choose only one action flag: --status, --start, --settle, or --realize")
  }
  return selected[0] ?? "auto"
}

function parseProducts(argv: string[]): ProductSelection[] {
  if (argv.includes("--run-all")) {
    return ["all"]
  }

  const products: ProductSelection[] = []
  if (argv.includes("--run-hedged-plp")) {
    products.push("hedged_plp")
  }
  if (argv.includes("--run-range-ladder")) {
    products.push("range_ladder")
  }

  return products.length > 0 ? products : ["all"]
}

export function parseCliOptions(argv: string[]): CliOptions {
  const watch = argv.includes("--watch")
  if (watch && argv.includes("--once")) {
    throw new Error("choose either --watch or --once, not both")
  }

  return {
    action: parseAction(argv),
    dryRun: argv.includes("--dry-run"),
    products: parseProducts(argv),
    watch,
  }
}
