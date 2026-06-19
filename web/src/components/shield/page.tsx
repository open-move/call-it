import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState } from "react"

import { AssetIcon } from "@/components/shared/market/asset-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatDecimalUnits, parseDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import { formatExpiryDistance, formatUsd } from "@/lib/format"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import type { ShieldProduct } from "@/lib/types/shield"
import { cn } from "@/lib/utils"
import { formatPredictTradeError } from "@/services/predict-quotes"
import { executeSuiTransaction } from "@/services/predict-transactions"
import {
  getShieldVaultState,
  getShieldWalletState,
} from "@/services/shield-client"
import type {
  ShieldVaultState,
  ShieldWalletState,
} from "@/services/shield-client"
import {
  buildShieldVaultDepositTransaction,
  buildShieldVaultWithdrawTransaction,
} from "@/services/shield-transactions"

export interface PageProps {
  products: ShieldProduct[]
}

type ShieldAction = "deposit" | "withdraw"
type RoundStepId = "deposit" | "start" | "settle" | "realize"

const bpsFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

const sharePriceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
  minimumFractionDigits: 6,
})

const roundSteps = [
  { id: "deposit", label: "Deposit" },
  { id: "start", label: "Start" },
  { id: "settle", label: "Settle" },
  { id: "realize", label: "Realize" },
] satisfies { id: RoundStepId; label: string }[]

function formatDusdc(value: bigint, maximumFractionDigits = 2) {
  return `${formatDecimalUnits(
    value,
    PREDICT_QUOTE_DECIMALS,
    maximumFractionDigits
  )} DUSDC`
}

function formatShares(value: bigint, maximumFractionDigits = 4) {
  return `${formatDecimalUnits(
    value,
    PREDICT_QUOTE_DECIMALS,
    maximumFractionDigits
  )} cSHIELD`
}

function formatBps(value: number | bigint) {
  return `${bpsFormatter.format(Number(value) / 100)}%`
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function getVaultStatus(vault?: ShieldVaultState) {
  if (!vault) {
    return "Loading"
  }

  if (vault.paused) {
    return "Paused"
  }

  if (vault.activeRound?.settled) {
    return "Oracle settled"
  }

  if (vault.activeRound) {
    return "Round active"
  }

  return "Open"
}

function getWithdrawQuote(amount: bigint | null, vault?: ShieldVaultState) {
  if (!amount || !vault || vault.shareSupply === 0n) {
    return undefined
  }

  return (amount * vault.nav) / vault.shareSupply
}

function getDepositQuote(amount: bigint | null, vault?: ShieldVaultState) {
  if (!amount || !vault) {
    return undefined
  }

  if (vault.shareSupply === 0n || vault.nav === 0n) {
    return amount
  }

  return (amount * vault.shareSupply) / vault.nav
}

function getUserValue(wallet?: ShieldWalletState, vault?: ShieldVaultState) {
  return getWithdrawQuote(wallet?.shieldShareBalance ?? null, vault) ?? 0n
}

function getRoundStage(vault?: ShieldVaultState): RoundStepId {
  if (!vault?.activeRound) {
    return "deposit"
  }

  return vault.activeRound.settled ? "settle" : "start"
}

function getRoundStateCopy(vault?: ShieldVaultState) {
  if (!vault) {
    return "Loading Shield round state."
  }

  if (vault.paused) {
    return "Vault actions are paused while the operator reviews the round."
  }

  if (!vault.activeRound) {
    return "Deposits and withdrawals are open until the next Predict round starts."
  }

  if (vault.activeRound.settled) {
    return "Oracle settled. The vault can redeem the hedge, withdraw PLP, and reopen."
  }

  return "Capital is deployed into PLP with a DOWN hedge below spot."
}

function getStepState(step: RoundStepId, activeStep: RoundStepId) {
  const activeIndex = roundSteps.findIndex(
    (roundStep) => roundStep.id === activeStep
  )
  const stepIndex = roundSteps.findIndex((roundStep) => roundStep.id === step)

  if (stepIndex < activeIndex) {
    return "complete"
  }

  if (stepIndex === activeIndex) {
    return "active"
  }

  return "idle"
}

function getRoundProduct(
  vault: ShieldVaultState | undefined,
  products: ShieldProduct[]
) {
  const oracleId = vault?.activeRound?.oracleId

  if (!oracleId) {
    return undefined
  }

  return products.find((product) => product.market.oracleId === oracleId)
}

function getInvalidReason({
  action,
  actionBalance,
  canUseVault,
  isLoadingWallet,
  parsedAmount,
  status,
  vault,
  walletAddress,
}: {
  action: ShieldAction
  actionBalance?: bigint
  canUseVault: boolean
  isLoadingWallet: boolean
  parsedAmount: bigint | null
  status: string
  vault?: ShieldVaultState
  walletAddress?: string
}) {
  if (!walletAddress) {
    return "Connect wallet to use Shield."
  }

  if (!vault) {
    return "Shield vault is still loading."
  }

  if (!canUseVault) {
    return status === "Oracle settled"
      ? "This Shield round is settled. New actions require realization."
      : "Deposits and withdrawals are closed while a Shield round is active."
  }

  if (isLoadingWallet) {
    return "Wallet balances are loading."
  }

  if (!parsedAmount) {
    return "Enter a positive amount."
  }

  if (actionBalance !== undefined && parsedAmount > actionBalance) {
    return action === "deposit"
      ? "Deposit exceeds DUSDC balance."
      : "Withdrawal exceeds cSHIELD balance."
  }

  return undefined
}

export function Page({ products }: PageProps) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const walletAddress = primaryWallet?.address
  const refreshRoute = useAppRouteRefresh()
  const [vault, setVault] = useState<ShieldVaultState | undefined>()
  const [wallet, setWallet] = useState<ShieldWalletState | undefined>()
  const [isLoadingVault, setIsLoadingVault] = useState(true)
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)
  const [action, setAction] = useState<ShieldAction>("deposit")
  const [dialogAction, setDialogAction] = useState<ShieldAction>()
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState<string | undefined>()
  const [messageTone, setMessageTone] = useState<"error" | "muted">("muted")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const parsedAmount = parseDecimalUnits(amount, PREDICT_QUOTE_DECIMALS)
  const depositQuote = getDepositQuote(parsedAmount, vault)
  const withdrawQuote = getWithdrawQuote(parsedAmount, vault)
  const status = getVaultStatus(vault)
  const roundProduct = getRoundProduct(vault, products)
  const canUseVault = !!vault && !vault.paused && !vault.activeRound
  const actionBalance =
    action === "deposit" ? wallet?.dusdcBalance : wallet?.shieldShareBalance
  const canSubmit =
    !!walletAddress &&
    canUseVault &&
    !!parsedAmount &&
    actionBalance !== undefined &&
    parsedAmount <= actionBalance
  const invalidReason = getInvalidReason({
    action,
    actionBalance,
    canUseVault,
    isLoadingWallet,
    parsedAmount,
    status,
    vault,
    walletAddress,
  })

  async function refreshVault() {
    setIsLoadingVault(true)

    try {
      const nextVault = await getShieldVaultState()

      setVault(nextVault)
      setMessage(undefined)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to load Shield"
      )
      setMessageTone("error")
    } finally {
      setIsLoadingVault(false)
    }
  }

  async function refreshWallet(address: string) {
    setIsLoadingWallet(true)

    try {
      setWallet(await getShieldWalletState(address))
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to load wallet balances"
      )
      setMessageTone("error")
    } finally {
      setIsLoadingWallet(false)
    }
  }

  useEffect(() => {
    void refreshVault()
  }, [])

  useEffect(() => {
    if (!walletAddress) {
      setWallet(undefined)
      return
    }

    void refreshWallet(walletAddress)
  }, [walletAddress])

  async function refreshAll() {
    await refreshVault()

    if (walletAddress) {
      await refreshWallet(walletAddress)
    }
  }

  function handleMaxAmount() {
    const maxAmount =
      action === "deposit"
        ? (wallet?.dusdcBalance ?? 0n)
        : (wallet?.shieldShareBalance ?? 0n)

    setAmount(formatDecimalUnits(maxAmount, PREDICT_QUOTE_DECIMALS))
    setMessage(undefined)
  }

  function openActionDialog(nextAction: ShieldAction) {
    setAction(nextAction)
    setDialogAction(nextAction)
    setAmount("")
    setMessage(undefined)
    setMessageTone("muted")
  }

  function handleDialogOpenChange(open: boolean) {
    if (open) {
      return
    }

    setDialogAction(undefined)
    setAmount("")
    setMessage(undefined)
    setMessageTone("muted")
  }

  async function handleSubmit() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setMessage(RECONNECT_SUI_WALLET_MESSAGE)
      setMessageTone("error")
      setShowAuthFlow(true)
      return
    }

    if (!canSubmit || !parsedAmount) {
      setMessage(invalidReason ?? "Enter a valid amount")
      setMessageTone("error")
      return
    }

    setIsSubmitting(true)
    setMessage(
      action === "deposit" ? "Preparing deposit" : "Preparing withdrawal"
    )
    setMessageTone("muted")

    try {
      const transaction =
        action === "deposit"
          ? await buildShieldVaultDepositTransaction({
              amount: parsedAmount,
              walletAddress,
            })
          : await buildShieldVaultWithdrawTransaction({
              amount: parsedAmount,
              walletAddress,
            })

      setMessage(
        action === "deposit" ? "Depositing DUSDC" : "Withdrawing DUSDC"
      )
      await executeSuiTransaction(signer, transaction)
      setMessage(
        action === "deposit" ? "Deposit confirmed" : "Withdrawal confirmed"
      )
      setAmount("")
      setDialogAction(undefined)
      await refreshAll()
      refreshRoute()
      window.setTimeout(refreshRoute, 1_500)
    } catch (error) {
      setMessage(formatPredictTradeError(error, "Shield transaction failed"))
      setMessageTone("error")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <ShieldProductHeader />

        <div className="mx-auto grid max-w-5xl items-stretch gap-3 lg:grid-cols-2">
          <ShieldOverviewCard
            isLoading={isLoadingVault}
            status={status}
            vault={vault}
          />

          <ShieldPositionPanel
            onOpenAction={openActionDialog}
            onSignIn={() => setShowAuthFlow(true)}
            vault={vault}
            wallet={wallet}
            walletAddress={walletAddress}
          />
        </div>

        <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-2">
          <RoundProgressCard
            product={roundProduct}
            status={status}
            vault={vault}
          />
          <ShieldPolicyCard vault={vault} />
        </div>
      </section>

      <ShieldActionDialog
        action={action}
        actionBalance={actionBalance}
        amount={amount}
        buttonDisabled={isSubmitting || (!!walletAddress && !canSubmit)}
        canSubmit={canSubmit}
        depositQuote={depositQuote}
        invalidReason={invalidReason}
        isLoadingWallet={isLoadingWallet}
        isSubmitting={isSubmitting}
        message={message}
        messageTone={messageTone}
        onAmountChange={setAmount}
        onMaxAmount={wallet ? handleMaxAmount : undefined}
        onOpenChange={handleDialogOpenChange}
        onSubmit={handleSubmit}
        open={dialogAction !== undefined}
        status={status}
        vault={vault}
        withdrawQuote={withdrawQuote}
      />
    </main>
  )
}

function ShieldProductHeader() {
  return (
    <div className="mx-auto max-w-5xl rounded-md bg-card px-4 py-3">
      <div className="text-sm leading-none font-medium tracking-[-0.01em]">
        Shield · Predict LP + downside hedge
      </div>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
        Earn Predict LP returns with a built-in downside hedge. Users hold
        cSHIELD vault shares while the vault manages PLP supply, hedge spend,
        settlement, and roll-forward.
      </p>
    </div>
  )
}

function ShieldOverviewCard({
  isLoading,
  status,
  vault,
}: {
  isLoading: boolean
  status: string
  vault?: ShieldVaultState
}) {
  return (
    <Card className="h-full gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Vault Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-4 pt-2 pb-4">
        <div className="space-y-2.5">
          <VaultOverviewRow
            label="Vault NAV"
            value={vault ? formatDusdc(vault.nav) : isLoading ? "--" : "Setup"}
          />
          <VaultOverviewRow
            label="Cash reserve"
            value={vault ? formatDusdc(vault.cash) : "--"}
          />
          <VaultOverviewRow
            label="PLP deployed"
            value={vault ? formatDusdc(vault.plpCostBasis) : "--"}
          />
          <VaultOverviewRow
            label="PLP balance"
            value={
              vault
                ? formatDecimalUnits(vault.plpAmount, PREDICT_QUOTE_DECIMALS, 4)
                : "--"
            }
          />
          <VaultOverviewRow
            label="cSHIELD Supply"
            value={vault ? formatShares(vault.shareSupply) : "--"}
          />
          <VaultOverviewRow
            label="cSHIELD Price"
            value={
              vault
                ? `${sharePriceFormatter.format(vault.sharePrice)} DUSDC`
                : "--"
            }
          />
          <VaultOverviewRow label="Status" value={status} />
        </div>

        <CapitalStack vault={vault} />
      </CardContent>
    </Card>
  )
}

function CapitalStack({ vault }: { vault?: ShieldVaultState }) {
  const plpAllocation = vault?.policy.maxPlpAllocationBps ?? 0
  const hedgeBudget = vault?.policy.hedgeBudgetBps ?? 0
  const reserve = vault?.policy.reserveBps ?? 0

  return (
    <div className="mt-4 rounded-md border border-border/35 bg-muted/25 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground">
          Capital stack
        </span>
        <span className="font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
          Policy caps
        </span>
      </div>
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-background/80">
        <div
          className="bg-primary"
          style={{ width: `${Math.max(0, plpAllocation) / 100}%` }}
        />
        <div
          className="bg-primary/45"
          style={{ width: `${Math.max(0, hedgeBudget) / 100}%` }}
        />
        <div
          className="bg-muted-foreground/35"
          style={{ width: `${Math.max(0, reserve) / 100}%` }}
        />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <AllocationItem
          label="PLP cap"
          value={vault ? formatBps(vault.policy.maxPlpAllocationBps) : "--"}
        />
        <AllocationItem
          label="Hedge budget"
          value={vault ? formatBps(vault.policy.hedgeBudgetBps) : "--"}
        />
        <AllocationItem
          label="Reserve"
          value={vault ? formatBps(vault.policy.reserveBps) : "--"}
        />
      </div>
    </div>
  )
}

function AllocationItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] leading-none text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function ShieldPositionPanel({
  onOpenAction,
  onSignIn,
  vault,
  wallet,
  walletAddress,
}: {
  onOpenAction: (action: ShieldAction) => void
  onSignIn: () => void
  vault?: ShieldVaultState
  wallet?: ShieldWalletState
  walletAddress?: string
}) {
  const walletValue = getUserValue(wallet, vault)

  return (
    <Card className="h-full gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Your Position
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-4 pt-2 pb-4">
        {walletAddress ? (
          <div className="space-y-3 pt-1">
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                Shield value
              </div>
              <div className="mt-1 font-mono text-xl leading-tight font-medium tracking-tight text-foreground tabular-nums">
                {formatDusdc(walletValue)}
              </div>
            </div>
            <div className="space-y-2 rounded-md border border-border/35 bg-muted/25 p-2.5">
              <PanelRow
                label="DUSDC balance"
                value={wallet ? formatDusdc(wallet.dusdcBalance, 4) : "--"}
              />
              <PanelRow
                label="cSHIELD balance"
                value={wallet ? formatShares(wallet.shieldShareBalance) : "--"}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm">
            <p className="text-center text-xs text-muted-foreground">
              Connect wallet to view your Shield position.
            </p>
            <Button className="w-full" onClick={onSignIn} type="button">
              Sign in to manage Shield
            </Button>
          </div>
        )}

        {walletAddress && (
          <div className="mt-auto grid grid-cols-2 gap-2">
            <Button onClick={() => onOpenAction("deposit")} type="button">
              Deposit DUSDC
            </Button>
            <Button
              onClick={() => onOpenAction("withdraw")}
              type="button"
              variant="outline"
            >
              Withdraw
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RoundProgressCard({
  product,
  status,
  vault,
}: {
  product?: ShieldProduct
  status: string
  vault?: ShieldVaultState
}) {
  const round = vault?.activeRound
  const activeStep = getRoundStage(vault)
  const roundCopy = getRoundStateCopy(vault)

  return (
    <Card className="gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Current Round
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pt-2 pb-4">
        <div className="rounded-md border border-border/35 bg-muted/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-foreground">
              {status}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
              PLP + DOWN hedge
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {roundCopy}
          </p>
        </div>

        <div className="grid overflow-hidden rounded-md border border-border/35 bg-muted/25 md:grid-cols-4">
          {roundSteps.map((step) => (
            <RoundStep
              key={step.id}
              label={step.label}
              state={getStepState(step.id, activeStep)}
            />
          ))}
        </div>

        <div className="space-y-2 rounded-md border border-border/35 bg-muted/15 p-3">
          <RoundDetailRow label="Vault state" value={status} />
          <RoundDetailRow
            label="Downside trigger"
            value={round ? `Below ${formatUsd(round.strikeUsd, 0)}` : "--"}
          />
          <RoundDetailRow
            label="DOWN hedge size"
            value={
              round
                ? formatDecimalUnits(
                    round.hedgeQuantity,
                    PREDICT_QUOTE_DECIMALS,
                    4
                  )
                : "--"
            }
          />
          <RoundDetailRow
            label="Oracle"
            value={round ? formatAddress(round.oracleId) : "No active round"}
          />
        </div>

        {product ? (
          <div className="flex items-center gap-2 rounded-md border border-border/35 bg-muted/25 px-3 py-2">
            <AssetIcon
              assetIconUrl={product.market.assetIconUrl}
              assetName={product.market.assetName}
              assetSymbol={product.market.assetSymbol}
              className="size-6"
            />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-foreground">
                {product.market.assetSymbol} hedge context
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
                {formatExpiryDistance(product.market.expiryMs)} · spot{" "}
                {formatUsd(product.market.currentPriceUsd, 0)}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ShieldPolicyCard({ vault }: { vault?: ShieldVaultState }) {
  return (
    <Card className="gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Vault Policy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pt-2 pb-4">
        <PolicyRow
          label="Hedge budget"
          value={vault ? formatBps(vault.policy.hedgeBudgetBps) : "--"}
        />
        <PolicyRow
          label="Reserve"
          value={vault ? formatBps(vault.policy.reserveBps) : "--"}
        />
        <PolicyRow
          label="PLP allocation cap"
          value={vault ? formatBps(vault.policy.maxPlpAllocationBps) : "--"}
        />
        <PolicyRow
          label="Strike band"
          value={vault ? formatBps(vault.policy.strikeBandBps) : "--"}
        />
        <PolicyRow
          label="Max hedge ask"
          value={vault ? formatBps(vault.policy.maxHedgeAskBps) : "--"}
        />
      </CardContent>
    </Card>
  )
}

function ShieldActionDialog({
  action,
  actionBalance,
  amount,
  buttonDisabled,
  canSubmit,
  depositQuote,
  invalidReason,
  isLoadingWallet,
  isSubmitting,
  message,
  messageTone,
  onAmountChange,
  onMaxAmount,
  onOpenChange,
  onSubmit,
  open,
  status,
  vault,
  withdrawQuote,
}: {
  action: ShieldAction
  actionBalance?: bigint
  amount: string
  buttonDisabled: boolean
  canSubmit: boolean
  depositQuote?: bigint
  invalidReason?: string
  isLoadingWallet: boolean
  isSubmitting: boolean
  message?: string
  messageTone: "error" | "muted"
  onAmountChange: (amount: string) => void
  onMaxAmount?: () => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
  open: boolean
  status: string
  vault?: ShieldVaultState
  withdrawQuote?: bigint
}) {
  const isDeposit = action === "deposit"
  const buttonLabel = isSubmitting
    ? isDeposit
      ? "Depositing"
      : "Withdrawing"
    : isDeposit
      ? "Deposit DUSDC"
      : "Withdraw cSHIELD"

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-5 rounded-md border-0 bg-card p-5 shadow-none ring-0 sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
            {isDeposit ? "Deposit DUSDC" : "Withdraw cSHIELD"}
          </DialogTitle>
        </DialogHeader>

        <label className="block space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            Amount
          </span>
          <div className="relative">
            <Input
              className="border-border/35 bg-muted/25 pr-28 font-mono text-sm shadow-none ring-0 transition-[background-color,border-color,color] duration-150 hover:bg-muted/30 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
              inputMode="decimal"
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="0.00"
              value={amount}
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-2 text-xs text-muted-foreground">
              <Button
                className="px-2 font-mono text-[10px]"
                disabled={!onMaxAmount}
                onClick={onMaxAmount}
                size="xs"
                type="button"
                variant="ghost"
              >
                MAX
              </Button>
              <span>{isDeposit ? "DUSDC" : "cSHIELD"}</span>
            </div>
          </div>
        </label>

        <div className="space-y-2.5 rounded-md border border-border/35 bg-muted/25 px-3 py-3">
          <div className="text-xs font-medium text-muted-foreground">
            Preview
          </div>
          <PanelRow
            label="Balance"
            value={
              actionBalance === undefined
                ? "--"
                : isDeposit
                  ? formatDusdc(actionBalance, 4)
                  : formatShares(actionBalance)
            }
          />
          <PanelRow
            label={isDeposit ? "Est. cSHIELD" : "Est. DUSDC"}
            value={
              isDeposit
                ? depositQuote
                  ? formatShares(depositQuote, 6)
                  : "--"
                : withdrawQuote
                  ? formatDusdc(withdrawQuote, 4)
                  : "--"
            }
          />
          <PanelRow
            label="cSHIELD price"
            value={
              vault
                ? `${sharePriceFormatter.format(vault.sharePrice)} DUSDC`
                : "--"
            }
          />
          <PanelRow label="Vault status" value={status} />
          {isDeposit ? (
            <PanelRow
              label="Round access"
              value={status === "Open" ? "Open vault" : "Next open round"}
            />
          ) : null}
        </div>

        {message ? (
          <ShieldMessage tone={messageTone}>{message}</ShieldMessage>
        ) : null}
        {!message && invalidReason ? (
          <ShieldMessage tone="muted">{invalidReason}</ShieldMessage>
        ) : null}
        {!message && !invalidReason && isLoadingWallet ? (
          <ShieldMessage tone="muted">Loading wallet balances.</ShieldMessage>
        ) : null}

        <DialogFooter>
          <Button
            className="w-full active:scale-[0.98]"
            disabled={buttonDisabled || !canSubmit}
            onClick={onSubmit}
            size="lg"
            type="button"
          >
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VaultOverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs leading-none text-muted-foreground">
        {label}
      </span>
      <div className="truncate text-right font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function RoundStep({
  label,
  state,
}: {
  label: string
  state: "active" | "complete" | "idle"
}) {
  return (
    <div
      className={cn(
        "px-3 py-2 text-center text-xs md:border-r md:border-border/30 md:last:border-r-0",
        state === "active" && "bg-primary/10 font-medium text-primary",
        state === "complete" && "text-foreground",
        state === "idle" && "text-muted-foreground"
      )}
    >
      {label}
    </div>
  )
}

function RoundDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-2 last:border-b-0 last:pb-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="max-w-[58%] truncate text-right font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function ShieldMessage({
  children,
  tone,
}: {
  children: string
  tone: "error" | "muted"
}) {
  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 text-xs leading-5",
        tone === "error"
          ? "border border-destructive/25 bg-destructive/10 text-destructive"
          : "bg-muted/15 text-muted-foreground"
      )}
    >
      {children}
    </div>
  )
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/35 pb-2 last:border-b-0 last:pb-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function PanelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate text-right font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}
