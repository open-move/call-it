import { readdir } from "node:fs/promises"
import { join } from "node:path"

async function findMovePackages(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const hasMoveToml = entries.some(
    (entry) => entry.isFile() && entry.name === "Move.toml"
  )

  if (hasMoveToml) {
    return [root]
  }

  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => findMovePackages(join(root, entry.name)))
  )

  return nested.flat()
}

const buildEnv = process.env.SUI_BUILD_ENV ?? "testnet"

async function runSuiMove(packageDir: string, command: "build" | "test") {
  const process = Bun.spawn(["sui", "move", command, "--build-env", buildEnv], {
    cwd: packageDir,
    stderr: "inherit",
    stdout: "inherit",
  })

  const exitCode = await process.exited
  if (exitCode !== 0) {
    throw new Error(`sui move ${command} failed in ${packageDir}`)
  }
}

const packages = (await findMovePackages("packages")).sort()

if (packages.length === 0) {
  throw new Error("No Move.toml files found under packages/")
}

for (const packageDir of packages) {
  console.log(`\n==> ${packageDir}: sui move build --build-env ${buildEnv}`)
  await runSuiMove(packageDir, "build")
  console.log(`\n==> ${packageDir}: sui move test --build-env ${buildEnv}`)
  await runSuiMove(packageDir, "test")
}
