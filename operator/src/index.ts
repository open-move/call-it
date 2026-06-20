import { loadConfig } from "./config.ts"
import { runRangeLadderTick } from "./strategies/range-ladder.ts"
import { runShieldTick } from "./strategies/shield.ts"
import { createSuiClient, loadKeeperKeypair } from "./sui.ts"

type ProductSelection = "all" | "range_ladder" | "shield"
type CliAction = "auto" | "realize" | "settle" | "start" | "status"

interface CliOptions {
  action: CliAction
  dryRun: boolean
  once: boolean
  products: ProductSelection[]
  watch: boolean
}

function hasArg(name: string) {
  return process.argv.includes(name)
}

function parseAction(): CliAction {
  const actions = [
    ["--status", "status"],
    ["--start", "start"],
    ["--settle", "settle"],
    ["--realize", "realize"],
  ] as const
  const selected = actions.filter(([flag]) => hasArg(flag)).map(([, action]) => action)

  if (selected.length > 1) {
    throw new Error("Choose only one action flag: --status, --start, --settle, or --realize")
  }

  return selected[0] ?? "auto"
}

function parseProducts(): ProductSelection[] {
  if (hasArg("--run-all")) {
    return ["all"]
  }

  const products: ProductSelection[] = []

  if (hasArg("--run-shield")) {
    products.push("shield")
  }

  if (hasArg("--run-range-ladder")) {
    products.push("range_ladder")
  }

  return products.length > 0 ? products : ["all"]
}

function parseCliOptions(): CliOptions {
  const watch = hasArg("--watch")
  const once = hasArg("--once") || !watch

  if (watch && hasArg("--once")) {
    throw new Error("Choose either --watch or --once, not both")
  }

  return {
    action: parseAction(),
    dryRun: hasArg("--dry-run"),
    once,
    products: parseProducts(),
    watch,
  }
}

function shouldRunShield(products: ProductSelection[], shieldEnabled: boolean) {
  return products.includes("shield") || (products.includes("all") && shieldEnabled)
}

function shouldRunRangeLadder(
  products: ProductSelection[],
  rangeLadderEnabled: boolean
) {
  return products.includes("range_ladder") || (products.includes("all") && rangeLadderEnabled)
}

function rangeLadderAction(action: CliAction) {
  if (action === "realize") {
    throw new Error("--realize is only valid for Shield")
  }

  return action
}

async function runTick(options: CliOptions) {
  const config = loadConfig()
  const dryRun = options.dryRun || config.dryRun
  const client = createSuiClient(config)
  const needsSigner = options.action !== "status"
  const keypair = needsSigner ? loadKeeperKeypair() : undefined
  const runShield = shouldRunShield(options.products, config.shield.enabled)
  const runRangeLadder = shouldRunRangeLadder(
    options.products,
    config.rangeLadder.enabled
  )

  if (!runShield && !runRangeLadder) {
    console.log("[operator] no enabled strategies selected")
    return
  }

  const at = new Date().toISOString()
  console.log(
    `[operator] tick at=${at} action=${options.action} dryRun=${dryRun} runShield=${runShield} runRangeLadder=${runRangeLadder}`
  )

  if (runShield) {
    try {
      await runShieldTick(client, keypair, config, {
        action: options.action,
        dryRun,
      })
    } catch (error) {
      console.error(
        `[shield] error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  if (runRangeLadder) {
    try {
      await runRangeLadderTick(client, keypair, config, {
        action: rangeLadderAction(options.action),
        dryRun,
      })
    } catch (error) {
      console.error(
        `[range_ladder] error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

async function main() {
  const options = parseCliOptions()

  if (options.once) {
    await runTick(options)
    return
  }

  const config = loadConfig()
  console.log(
    `[operator] watching pollSeconds=${config.pollSeconds} products=${options.products.join(",")}`
  )
  let running = false

  const tick = async () => {
    if (running) {
      console.log("[operator] previous tick still running; skipped")
      return
    }

    running = true

    try {
      await runTick(options)
    } catch (error) {
      console.error(
        `[operator] tick error: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      running = false
    }
  }

  await tick()
  setInterval(tick, config.pollSeconds * 1000)
}

main().catch((error) => {
  console.error(`[operator] fatal: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
