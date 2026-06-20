import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { decodeSuiPrivateKey } from "@mysten/sui/cryptography"
import { SuiGrpcClient } from "@mysten/sui/grpc"
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"
import { Transaction } from "@mysten/sui/transactions"
import type { SuiClientTypes } from "@mysten/sui/client"

const execFileAsync = promisify(execFile)

const TESTNET_CHAIN_ID = "4c78adac"
const DEFAULT_FUND_AMOUNT_MIST = 2_000_000_000n
const DEFAULT_HEDGED_PLP_POLICY = {
  hedgeBudgetBps: 1_000,
  maxHedgeAskBps: 10_000n,
  maxPlpAllocationBps: 7_000,
  reserveBps: 1_000,
  strikeBandBps: 2_000,
}
const DEFAULT_RANGE_LADDER_POLICY = {
  maxRangeAskBps: 10_000n,
  maxRungCount: 16n,
  premiumBudgetBps: 1_000,
  reserveBps: 1_000,
}

type Network = "mainnet" | "testnet" | "devnet" | "localnet"

interface BuildOutput {
  dependencies: string[]
  modules: string[]
}

interface PublishResult {
  packageId: string
  treasuryCapId?: string
  upgradeCapId?: string
}

interface DeploymentRecord {
  baseVault: {
    capId: string
    packageId: string
    vaultId: string
  }
  deployer: string
  hedgedPlp: {
    adminCapId: string
    keeperCapId: string
    managerId: string
    packageId: string
    strategyId: string
  }
  network: Network
  operator: string
  rangeLadder: {
    adminCapId: string
    keeperCapId: string
    managerId: string
    packageId: string
    strategyId: string
  }
}

function requireEnv(name: string) {
  const value = process.env[name]

  if (!value || value.trim() === "") {
    throw new Error(`${name} is required`)
  }

  return value.trim()
}

function optionalEnv(name: string, fallback: string) {
  const value = process.env[name]

  return value && value.trim() !== "" ? value.trim() : fallback
}

function readBigIntEnv(name: string, fallback: bigint) {
  const value = process.env[name]

  return value && value.trim() !== "" ? BigInt(value.trim()) : fallback
}

async function exportCliKey(identity: string) {
  const { stdout } = await execFileAsync("sui", [
    "keytool",
    "export",
    "--key-identity",
    identity,
    "--json",
  ])
  const parsed = JSON.parse(stdout) as { exportedPrivateKey?: unknown }

  if (typeof parsed.exportedPrivateKey !== "string" || !parsed.exportedPrivateKey.startsWith("suiprivkey")) {
    throw new Error(`Could not export private key for ${identity}`)
  }

  return parsed.exportedPrivateKey
}

async function activeCliAddress() {
  const { stdout } = await execFileAsync("sui", ["client", "active-address"])

  return stdout.trim()
}

async function loadDeployerKeypair() {
  const raw = process.env.SUI_DEPLOYER_KEY?.trim() || await exportCliKey(
    process.env.SUI_DEPLOYER_ADDRESS?.trim() || await activeCliAddress()
  )
  const { scheme, secretKey } = decodeSuiPrivateKey(raw)

  if (scheme !== "ED25519") {
    throw new Error(`Unsupported SUI_DEPLOYER_KEY scheme ${scheme}; use ED25519`)
  }

  return Ed25519Keypair.fromSecretKey(secretKey)
}

async function buildPackage(packagePath: string, buildEnv: Network) {
  const { stdout } = await execFileAsync("sui", [
    "move",
    "build",
    "--path",
    packagePath,
    "--build-env",
    buildEnv,
    "--dump-bytecode-as-base64",
  ], {
    maxBuffer: 50 * 1024 * 1024,
  })
  const lines = stdout.trim().split("\n")
  let jsonLine: string | undefined

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]

    if (line?.trim().startsWith("{")) {
      jsonLine = line
      break
    }
  }

  if (!jsonLine) {
    throw new Error(`Could not parse build output for ${packagePath}`)
  }

  return JSON.parse(jsonLine) as BuildOutput
}

async function executeTransaction(
  client: SuiGrpcClient,
  signer: Ed25519Keypair,
  transaction: Transaction,
  label: string
) {
  const result = await client.signAndExecuteTransaction({
    include: { effects: true, events: true, objectTypes: true },
    signer,
    transaction,
  })

  if (result.$kind === "FailedTransaction") {
    throw new Error(`${label} failed: ${result.FailedTransaction.status.error?.message ?? "transaction failed"}`)
  }

  const finalResult = await client.waitForTransaction({
    include: { effects: true, events: true, objectTypes: true },
    result,
    timeout: 120_000,
  })

  if (finalResult.$kind === "FailedTransaction") {
    throw new Error(`${label} failed: ${finalResult.FailedTransaction.status.error?.message ?? "transaction failed"}`)
  }

  console.log(`[deploy] ${label} digest=${finalResult.Transaction.digest}`)

  return finalResult.Transaction
}

function changedObjects(transaction: SuiClientTypes.Transaction<{ effects: true; objectTypes: true }>) {
  return transaction.effects.changedObjects
}

function objectType(
  transaction: SuiClientTypes.Transaction<{ effects: true; objectTypes: true }>,
  objectId: string
) {
  return transaction.objectTypes[objectId]
}

function createdPackageId(transaction: SuiClientTypes.Transaction<{ effects: true; objectTypes: true }>) {
  const createdPackage = changedObjects(transaction).find(
    (object) => object.idOperation === "Created" && object.outputState === "PackageWrite"
  )

  if (!createdPackage) {
    throw new Error("Publish transaction did not create a package")
  }

  return createdPackage.objectId
}

function createdObjectByType(
  transaction: SuiClientTypes.Transaction<{ effects: true; objectTypes: true }>,
  typeMatcher: (type: string) => boolean
) {
  const created = changedObjects(transaction).find((object) => {
    if (object.idOperation !== "Created" || object.outputState !== "ObjectWrite") {
      return false
    }

    const type = objectType(transaction, object.objectId)

    return type ? typeMatcher(type) : false
  })

  return created?.objectId
}

async function ownedObjectByType({
  client,
  owner,
  type,
}: {
  client: SuiGrpcClient
  owner: string
  type: string
}) {
  const page = await client.listOwnedObjects({
    limit: 50,
    owner,
    type,
  })

  if (page.objects.length === 0) {
    return undefined
  }

  if (page.objects.length > 1) {
    throw new Error(`Expected one owned object of type ${type}, found ${page.objects.length}`)
  }

  return page.objects[0]?.objectId
}

function eventJson<T>(
  transaction: SuiClientTypes.Transaction<{ events: true }>,
  eventTypeSuffix: string
) {
  const event = transaction.events.find((item) => item.eventType.endsWith(eventTypeSuffix))

  if (!event?.json) {
    throw new Error(`Missing event ${eventTypeSuffix}`)
  }

  return event.json as T
}

async function publishPackage({
  buildEnv,
  client,
  deployer,
  label,
  packagePath,
  treasuryTypeSuffix,
}: {
  buildEnv: Network
  client: SuiGrpcClient
  deployer: Ed25519Keypair
  label: string
  packagePath: string
  treasuryTypeSuffix?: string
}) {
  const build = await buildPackage(packagePath, buildEnv)
  const tx = new Transaction()
  const deployerAddress = deployer.toSuiAddress()

  tx.setSender(deployerAddress)
  tx.setGasBudget(1_000_000_000)
  const [upgradeCap] = tx.publish(build)
  tx.transferObjects([upgradeCap], deployerAddress)

  const transaction = await executeTransaction(client, deployer, tx, `publish ${label}`)
  const packageId = createdPackageId(transaction)
  const treasuryType = treasuryTypeSuffix
    ? `0x2::coin::TreasuryCap<${packageId}${treasuryTypeSuffix}>`
    : undefined
  const upgradeCapId = createdObjectByType(
    transaction,
    (type) => type === "0x2::package::UpgradeCap"
  )
  const treasuryCapId = treasuryType
    ? await ownedObjectByType({ client, owner: deployer.toSuiAddress(), type: treasuryType })
    : undefined

  console.log(`[deploy] ${label} package=${packageId}`)

  return { packageId, treasuryCapId, upgradeCapId } satisfies PublishResult
}

function publishedToml(packageId: string, network: Network) {
  if (network !== "testnet") {
    throw new Error("This deploy script currently supports testnet only")
  }

  return `# Generated by operator/src/deploy.ts\n[published.testnet]\nchain-id = "${TESTNET_CHAIN_ID}"\npublished-at = "${packageId}"\noriginal-id = "${packageId}"\nversion = 1\ntoolchain-version = "1.73.1"\nbuild-config = { flavor = "sui", edition = "2024" }\n`
}

async function createBaseVault({
  basePackageId,
  baseTreasuryCapId,
  client,
  deployer,
  quoteAsset,
}: {
  basePackageId: string
  baseTreasuryCapId: string
  client: SuiGrpcClient
  deployer: Ed25519Keypair
  quoteAsset: string
}) {
  const tx = new Transaction()
  const deployerAddress = deployer.toSuiAddress()

  tx.setSender(deployerAddress)
  tx.setGasBudget(500_000_000)
  const [vault, cap] = tx.moveCall({
    target: `${basePackageId}::base_vault::create_vault`,
    typeArguments: [quoteAsset],
    arguments: [tx.object(baseTreasuryCapId)],
  })
  tx.moveCall({
    target: `${basePackageId}::base_vault::share_vault`,
    typeArguments: [quoteAsset],
    arguments: [vault],
  })
  tx.transferObjects([cap], deployerAddress)

  const transaction = await executeTransaction(client, deployer, tx, "create base vault")
  const event = eventJson<{ cap_id: string; vault_id: string }>(transaction, "::base_vault::BaseVaultCreated")

  return { capId: event.cap_id, vaultId: event.vault_id }
}

async function fundOperator({
  amount,
  client,
  deployer,
  operatorAddress,
}: {
  amount: bigint
  client: SuiGrpcClient
  deployer: Ed25519Keypair
  operatorAddress: string
}) {
  const tx = new Transaction()
  tx.setSender(deployer.toSuiAddress())
  tx.setGasBudget(100_000_000)
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)])
  tx.transferObjects([coin], operatorAddress)
  await executeTransaction(client, deployer, tx, "fund operator")
}

async function transferObject({
  client,
  deployer,
  label,
  objectId,
  recipient,
}: {
  client: SuiGrpcClient
  deployer: Ed25519Keypair
  label: string
  objectId: string
  recipient: string
}) {
  const tx = new Transaction()
  tx.setSender(deployer.toSuiAddress())
  tx.setGasBudget(100_000_000)
  tx.transferObjects([tx.object(objectId)], recipient)
  await executeTransaction(client, deployer, tx, label)
}

async function createPredictManager({
  client,
  operator,
  predictPackageId,
  label,
}: {
  client: SuiGrpcClient
  operator: Ed25519Keypair
  predictPackageId: string
  label: string
}) {
  const tx = new Transaction()
  tx.setSender(operator.toSuiAddress())
  tx.setGasBudget(300_000_000)
  tx.moveCall({ target: `${predictPackageId}::predict::create_manager` })

  const transaction = await executeTransaction(client, operator, tx, `create ${label} manager`)
  const managerId = createdObjectByType(transaction, (type) => type.endsWith("::predict_manager::PredictManager"))

  if (!managerId) {
    throw new Error(`Could not find created ${label} PredictManager`)
  }

  return managerId
}

async function createHedgedPlpStrategy({
  baseVaultId,
  client,
  deployerAddress,
  managerId,
  operator,
  packageId,
  quoteAsset,
  treasuryCapId,
}: {
  baseVaultId: string
  client: SuiGrpcClient
  deployerAddress: string
  managerId: string
  operator: Ed25519Keypair
  packageId: string
  quoteAsset: string
  treasuryCapId: string
}) {
  const tx = new Transaction()
  tx.setSender(operator.toSuiAddress())
  tx.setGasBudget(500_000_000)
  const policy = tx.moveCall({
    target: `${packageId}::policy::new`,
    arguments: [
      tx.pure.u16(DEFAULT_HEDGED_PLP_POLICY.hedgeBudgetBps),
      tx.pure.u16(DEFAULT_HEDGED_PLP_POLICY.strikeBandBps),
      tx.pure.u16(DEFAULT_HEDGED_PLP_POLICY.reserveBps),
      tx.pure.u16(DEFAULT_HEDGED_PLP_POLICY.maxPlpAllocationBps),
      tx.pure.u64(DEFAULT_HEDGED_PLP_POLICY.maxHedgeAskBps),
    ],
  })
  const [strategy, adminCap, keeperCap] = tx.moveCall({
    target: `${packageId}::strategy::create_strategy`,
    typeArguments: [quoteAsset],
    arguments: [tx.object(treasuryCapId), tx.object(baseVaultId), tx.object(managerId), policy],
  })
  tx.moveCall({
    target: `${packageId}::strategy::share_strategy`,
    typeArguments: [quoteAsset],
    arguments: [strategy],
  })
  tx.transferObjects([adminCap], deployerAddress)
  tx.transferObjects([keeperCap], operator.toSuiAddress())

  const transaction = await executeTransaction(client, operator, tx, "create Hedged PLP strategy")

  return eventJson<{ admin_cap_id: string; keeper_cap_id: string; strategy_id: string }>(
    transaction,
    "::strategy::StrategyCreated"
  )
}

async function createRangeLadderStrategy({
  baseVaultId,
  client,
  deployerAddress,
  managerId,
  operator,
  packageId,
  quoteAsset,
  treasuryCapId,
}: {
  baseVaultId: string
  client: SuiGrpcClient
  deployerAddress: string
  managerId: string
  operator: Ed25519Keypair
  packageId: string
  quoteAsset: string
  treasuryCapId: string
}) {
  const tx = new Transaction()
  tx.setSender(operator.toSuiAddress())
  tx.setGasBudget(500_000_000)
  const policy = tx.moveCall({
    target: `${packageId}::policy::new`,
    arguments: [
      tx.pure.u16(DEFAULT_RANGE_LADDER_POLICY.premiumBudgetBps),
      tx.pure.u16(DEFAULT_RANGE_LADDER_POLICY.reserveBps),
      tx.pure.u64(DEFAULT_RANGE_LADDER_POLICY.maxRangeAskBps),
      tx.pure.u64(DEFAULT_RANGE_LADDER_POLICY.maxRungCount),
    ],
  })
  const [strategy, adminCap, keeperCap] = tx.moveCall({
    target: `${packageId}::strategy::create_strategy`,
    typeArguments: [quoteAsset],
    arguments: [tx.object(treasuryCapId), tx.object(baseVaultId), tx.object(managerId), policy],
  })
  tx.moveCall({
    target: `${packageId}::strategy::share_strategy`,
    typeArguments: [quoteAsset],
    arguments: [strategy],
  })
  tx.transferObjects([adminCap], deployerAddress)
  tx.transferObjects([keeperCap], operator.toSuiAddress())

  const transaction = await executeTransaction(client, operator, tx, "create Range Ladder strategy")

  return eventJson<{ admin_cap_id: string; keeper_cap_id: string; strategy_id: string }>(
    transaction,
    "::strategy::StrategyCreated"
  )
}

async function writeOperatorEnv(record: DeploymentRecord, operatorSecretKey: string, envPath: string) {
  const contents = [
    `SUI_KEEPER_KEY=${operatorSecretKey}`,
    `SUI_RPC_URL=${optionalEnv("SUI_RPC_URL", "https://fullnode.testnet.sui.io:443")}`,
    `SUI_NETWORK=${record.network}`,
    "POLL_SECONDS=60",
    "DRY_RUN=false",
    "",
    `PREDICT_SERVER_URL=${optionalEnv("PREDICT_SERVER_URL", "https://predict-server.testnet.mystenlabs.com")}`,
    `PREDICT_PACKAGE_ID=${optionalEnv("PREDICT_PACKAGE_ID", "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138")}`,
    `PREDICT_OBJECT_ID=${optionalEnv("PREDICT_OBJECT_ID", "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a")}`,
    `PREDICT_QUOTE_ASSET=${optionalEnv("PREDICT_QUOTE_ASSET", "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC")}`,
    "CLOCK_OBJECT_ID=0x6",
    "PREDICT_ROUND_UNDERLYING_ASSET=BTC",
    "PREDICT_ROUND_INTERVAL_MS=7200000",
    "PREDICT_ROUND_INTERVAL_TOLERANCE_MS=300000",
    "PREDICT_ROUND_ENTRY_MIN_MS_TO_EXPIRY=4500000",
    "PREDICT_ROUND_ENTRY_MAX_MS_TO_EXPIRY=5400000",
    "",
    `BASE_VAULT_PACKAGE_ID=${record.baseVault.packageId}`,
    `BASE_VAULT_ID=${record.baseVault.vaultId}`,
    "",
    `HEDGED_PLP_STRATEGY_PACKAGE_ID=${record.hedgedPlp.packageId}`,
    `HEDGED_PLP_STRATEGY_ID=${record.hedgedPlp.strategyId}`,
    `HEDGED_PLP_KEEPER_CAP_ID=${record.hedgedPlp.keeperCapId}`,
    `HEDGED_PLP_MANAGER_ID=${record.hedgedPlp.managerId}`,
    "HEDGED_PLP_ENABLED=true",
    "HEDGED_PLP_STRIKE_SPOT_BPS=9900",
    "HEDGED_PLP_HEDGE_QUANTITY_BPS_OF_NAV=250",
    "",
    `RANGE_LADDER_STRATEGY_PACKAGE_ID=${record.rangeLadder.packageId}`,
    `RANGE_LADDER_STRATEGY_ID=${record.rangeLadder.strategyId}`,
    `RANGE_LADDER_KEEPER_CAP_ID=${record.rangeLadder.keeperCapId}`,
    `RANGE_LADDER_MANAGER_ID=${record.rangeLadder.managerId}`,
    "RANGE_LADDER_ENABLED=true",
    "RANGE_RUNG_COUNT=2",
    "RANGE_RUNG_WIDTH_BPS=25",
    "RANGE_QUANTITY_BPS_OF_NAV=250",
  ].join("\n") + "\n"

  await writeFile(envPath, contents, { flag: process.env.OVERWRITE_ENV === "true" ? "w" : "wx", mode: 0o600 })
}

async function main() {
  const network = optionalEnv("SUI_NETWORK", "testnet") as Network

  if (network !== "testnet") {
    throw new Error("Deployment currently supports SUI_NETWORK=testnet only")
  }

  const repoRoot = path.resolve(import.meta.dir, "../..")
  const deployer = await loadDeployerKeypair()
  const deployerAddress = deployer.toSuiAddress()
  const operator = Ed25519Keypair.generate()
  const operatorAddress = operator.toSuiAddress()
  const operatorSecretKey = operator.getSecretKey()
  const suiRpcUrl = optionalEnv("SUI_RPC_URL", "https://fullnode.testnet.sui.io:443")
  const predictPackageId = optionalEnv("PREDICT_PACKAGE_ID", "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138")
  const quoteAsset = optionalEnv("PREDICT_QUOTE_ASSET", "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC")
  const fundAmount = readBigIntEnv("OPERATOR_FUND_AMOUNT_MIST", DEFAULT_FUND_AMOUNT_MIST)
  const client = new SuiGrpcClient({ baseUrl: suiRpcUrl, network })
  const tmp = await mkdtemp(path.join(os.tmpdir(), "callit-deploy-"))

  console.log(`[deploy] deployer=${deployerAddress}`)
  console.log(`[deploy] operator=${operatorAddress}`)
  console.log(`[deploy] temp=${tmp}`)

  try {
    await execFileAsync("cp", ["-R", path.join(repoRoot, "packages"), tmp])
    const tempPackages = path.join(tmp, "packages")

    const existingBasePackageId = process.env.BASE_VAULT_PACKAGE_ID?.trim()
    const existingBaseTreasuryCapId = process.env.BASE_VAULT_TREASURY_CAP_ID?.trim()
    const base = existingBasePackageId && existingBaseTreasuryCapId
      ? {
          packageId: existingBasePackageId,
          treasuryCapId: existingBaseTreasuryCapId,
          upgradeCapId: undefined,
        } satisfies PublishResult
      : await publishPackage({
          buildEnv: network,
          client,
          deployer,
          label: "Base Vault",
          packagePath: path.join(tempPackages, "base_vault"),
          treasuryTypeSuffix: "::base_vault::BASE_VAULT",
        })

    if (!base.treasuryCapId) {
      throw new Error("Could not find Base Vault TreasuryCap")
    }

    await writeFile(
      path.join(tempPackages, "base_vault", "Published.toml"),
      publishedToml(base.packageId, network)
    )

    const baseVault = await createBaseVault({
      basePackageId: base.packageId,
      baseTreasuryCapId: base.treasuryCapId,
      client,
      deployer,
      quoteAsset,
    })

    const hedgedPlp = await publishPackage({
      buildEnv: network,
      client,
      deployer,
      label: "Hedged PLP",
      packagePath: path.join(tempPackages, "strategies", "hedged_plp"),
      treasuryTypeSuffix: "::hplp::HPLP",
    })
    const rangeLadder = await publishPackage({
      buildEnv: network,
      client,
      deployer,
      label: "Range Ladder",
      packagePath: path.join(tempPackages, "strategies", "range_ladder"),
      treasuryTypeSuffix: "::rladder::RLADDER",
    })

    if (!hedgedPlp.treasuryCapId || !rangeLadder.treasuryCapId) {
      throw new Error("Could not find strategy TreasuryCaps after publish")
    }

    await transferObject({
      client,
      deployer,
      label: "transfer HPLP TreasuryCap to operator",
      objectId: hedgedPlp.treasuryCapId,
      recipient: operatorAddress,
    })
    await transferObject({
      client,
      deployer,
      label: "transfer RLADDER TreasuryCap to operator",
      objectId: rangeLadder.treasuryCapId,
      recipient: operatorAddress,
    })
    await fundOperator({ amount: fundAmount, client, deployer, operatorAddress })

    const hedgedPlpManagerId = await createPredictManager({
      client,
      label: "Hedged PLP",
      operator,
      predictPackageId,
    })
    const rangeLadderManagerId = await createPredictManager({
      client,
      label: "Range Ladder",
      operator,
      predictPackageId,
    })

    const hedgedPlpStrategy = await createHedgedPlpStrategy({
      baseVaultId: baseVault.vaultId,
      client,
      deployerAddress,
      managerId: hedgedPlpManagerId,
      operator,
      packageId: hedgedPlp.packageId,
      quoteAsset,
      treasuryCapId: hedgedPlp.treasuryCapId,
    })
    const rangeLadderStrategy = await createRangeLadderStrategy({
      baseVaultId: baseVault.vaultId,
      client,
      deployerAddress,
      managerId: rangeLadderManagerId,
      operator,
      packageId: rangeLadder.packageId,
      quoteAsset,
      treasuryCapId: rangeLadder.treasuryCapId,
    })
    const record: DeploymentRecord = {
      baseVault: { capId: baseVault.capId, packageId: base.packageId, vaultId: baseVault.vaultId },
      deployer: deployerAddress,
      hedgedPlp: {
        adminCapId: hedgedPlpStrategy.admin_cap_id,
        keeperCapId: hedgedPlpStrategy.keeper_cap_id,
        managerId: hedgedPlpManagerId,
        packageId: hedgedPlp.packageId,
        strategyId: hedgedPlpStrategy.strategy_id,
      },
      network,
      operator: operatorAddress,
      rangeLadder: {
        adminCapId: rangeLadderStrategy.admin_cap_id,
        keeperCapId: rangeLadderStrategy.keeper_cap_id,
        managerId: rangeLadderManagerId,
        packageId: rangeLadder.packageId,
        strategyId: rangeLadderStrategy.strategy_id,
      },
    }
    const deploymentPath = path.join(import.meta.dir, `../deployment.${network}.json`)
    const envPath = path.join(import.meta.dir, "../.env")

    await writeFile(deploymentPath, `${JSON.stringify(record, null, 2)}\n`)
    await writeOperatorEnv(record, operatorSecretKey, envPath)

    console.log(`[deploy] wrote ${deploymentPath}`)
    console.log(`[deploy] wrote ${envPath}`)
    console.log("[deploy] start operator: cd operator && bun run start")
  } finally {
    if (process.env.KEEP_DEPLOY_TMP !== "true") {
      await rm(tmp, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
