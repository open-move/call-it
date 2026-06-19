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
type RoundStepId = "deposit" | "active" | "settled" | "reopened"

const bpsFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

const sharePriceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
  minimumFractionDigits: 6,
})

const roundSteps = [
  { id: "deposit", label: "Deposit Window" },
  { id: "active", label: "Round Active" },
  { id: "settled", label: "Oracle Settled" },
  { id: "reopened", label: "Reopened" },
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

  return vault.activeRound.settled ? "settled" : "active"
}

function getStepState(step: RoundStepId, activeStep: RoundStepId) {
  const activeIndex = roundSteps.findIndex((roundStep) => roundStep.id === activeStep)
  const stepIndex = roundSteps.findIndex((roundStep) => roundStep.id === step)

  if (stepIndex < activeIndex) {
    return "complete"
  }

  if (stepIndex === activeIndex) {
    return "active"
  }

  return "idle"
}

function getRoundProduct(vault: ShieldVaultState | undefined, products: ShieldProduct[]) {
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
  const userValue = getUserValue(wallet, vault)
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
      setMessage(error instanceof Error ? error.message : "Failed to load Shield")
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
        error instanceof Error ? error.message : "Failed to load wallet balances"
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
    setMessage(action === "deposit" ? "Preparing deposit" : "Preparing withdrawal")
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

      setMessage(action === "deposit" ? "Depositing DUSDC" : "Withdrawing DUSDC")
      await executeSuiTransaction(signer, transaction)
      setMessage(action === "deposit" ? "Deposit confirmed" : "Withdrawal confirmed")
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
        <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <ShieldOverviewCard
            isLoading={isLoadingVault}
            status={status}
            userValue={userValue}
            vault={vault}
          />

          <ShieldPositionPanel
            onOpenAction={openActionDialog}
            vault={vault}
            wallet={wallet}
            walletAddress={walletAddress}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
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

function ShieldOverviewCard({
  isLoading,
  status,
  userValue,
  vault,
}: {
  isLoading: boolean
  status: string
  userValue: bigint
  vault?: ShieldVaultState
}) {
  return (
    <Card className="h-full gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">Shield Overview</CardTitle>
      </CardHeader>
      <CardContent className="px-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-2 lg:grid-cols-4">
          <VaultStat
            label="NAV"
            value={vault ? formatDusdc(vault.nav) : isLoading ? "--" : "Setup"}
          />
          <VaultStat
            label="Available Cash"
            value={vault ? formatDusdc(vault.cash) : "--"}
          />
          <VaultStat
            label="Share Price"
            value={vault ? `${sharePriceFormatter.format(vault.sharePrice)} DUSDC` : "--"}
          />
          <VaultStat
            label="Share Supply"
            value={vault ? formatShares(vault.shareSupply) : "--"}
          />
          <VaultStat
            label="PLP Cost Basis"
            value={vault ? formatDusdc(vault.plpCostBasis) : "--"}
          />
          <VaultStat
            label="PLP Shares"
            value={
              vault
                ? formatDecimalUnits(vault.plpAmount, PREDICT_QUOTE_DECIMALS, 4)
                : "--"
            }
          />
          <VaultStat label="Your Value" value={formatDusdc(userValue)} />
          <VaultStat label="Status" value={status} />
        </div>

        <div className="mt-3 rounded-md bg-muted/40 px-3 py-3">
          <div className="text-xs font-medium text-foreground">What Shield does</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            DUSDC deposits mint cSHIELD vault shares. Between rounds the vault
            holds DUSDC cash; during a round it can deploy PLP plus a capped DOWN
            hedge. Deposits and withdrawals reopen after the round is realized.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ShieldPositionPanel({
  onOpenAction,
  vault,
  wallet,
  walletAddress,
}: {
  onOpenAction: (action: ShieldAction) => void
  vault?: ShieldVaultState
  wallet?: ShieldWalletState
  walletAddress?: string
}) {
  const walletValue = getUserValue(wallet, vault)

  return (
    <Card className="h-full gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">Your Position</CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4 px-4 py-4">
        {walletAddress ? (
          <div className="space-y-3 pt-1">
            <div>
              <div className="text-xs text-muted-foreground">Shield value</div>
              <div className="mt-1 font-mono text-2xl font-medium tracking-tight text-foreground tabular-nums">
                {formatDusdc(walletValue)}
              </div>
            </div>
            <div className="space-y-2 border-t border-border/40 pt-3">
              <PanelRow
                label="DUSDC"
                value={wallet ? formatDusdc(wallet.dusdcBalance, 4) : "--"}
              />
              <PanelRow
                label="cSHIELD"
                value={wallet ? formatShares(wallet.shieldShareBalance) : "--"}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center text-sm">
            <p className="text-center text-muted-foreground">
              Connect wallet to view your Shield position.
            </p>
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

  return (
    <Card className="gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">Round Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <div className="grid overflow-hidden rounded-md bg-muted/35 md:grid-cols-4">
          {roundSteps.map((step) => (
            <RoundStep
              key={step.id}
              label={step.label}
              state={getStepState(step.id, activeStep)}
            />
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <RoundMetric label="Status" value={status} />
          <RoundMetric
            label="Oracle"
            value={round ? formatAddress(round.oracleId) : "No active round"}
          />
          <RoundMetric
            label="Trigger"
            value={round ? `Below ${formatUsd(round.strikeUsd, 0)}` : "--"}
          />
          <RoundMetric
            label="Hedge"
            value={round ? formatDusdc(round.hedgeQuantity, 4) : "--"}
          />
        </div>

        {product ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/35 px-3 py-2">
            <AssetIcon
              assetIconUrl={product.market.assetIconUrl}
              assetName={product.market.assetName}
              assetSymbol={product.market.assetSymbol}
              className="size-6"
            />
            <div className="min-w-0">
              <div className="truncate text-xs text-foreground">
                {product.market.assetSymbol} round context
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums uppercase">
                {formatExpiryDistance(product.market.expiryMs)} · spot {formatUsd(product.market.currentPriceUsd, 0)}
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
    <Card className="gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">Vault Policy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        <PolicyRow
          label="Hedge Budget"
          value={vault ? formatBps(vault.policy.hedgeBudgetBps) : "--"}
        />
        <PolicyRow
          label="Reserve"
          value={vault ? formatBps(vault.policy.reserveBps) : "--"}
        />
        <PolicyRow
          label="Max PLP Allocation"
          value={vault ? formatBps(vault.policy.maxPlpAllocationBps) : "--"}
        />
        <PolicyRow
          label="Strike Band"
          value={vault ? formatBps(vault.policy.strikeBandBps) : "--"}
        />
        <PolicyRow
          label="Max Hedge Ask"
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
      ? "Deposit"
      : "Withdraw"

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-5 rounded-md border-0 bg-card p-5 shadow-none ring-0 sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm font-medium">
            {isDeposit ? "Deposit DUSDC" : "Withdraw cSHIELD"}
          </DialogTitle>
        </DialogHeader>

        <label className="block space-y-2">
          <span className="text-xs text-muted-foreground">Amount</span>
          <div className="relative">
            <Input
              className="border-0 pr-28 font-mono text-sm shadow-none ring-0 focus-visible:ring-1"
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

        <div className="space-y-2.5 rounded-md bg-muted px-3 py-3">
          <PanelRow
            label={isDeposit ? "DUSDC balance" : "cSHIELD balance"}
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
            label="Share price"
            value={vault ? `${sharePriceFormatter.format(vault.sharePrice)} DUSDC` : "--"}
          />
          <PanelRow label="Vault status" value={status} />
        </div>

        {message ? <ShieldMessage tone={messageTone}>{message}</ShieldMessage> : null}
        {!message && invalidReason ? (
          <ShieldMessage tone="muted">{invalidReason}</ShieldMessage>
        ) : null}
        {!message && !invalidReason && isLoadingWallet ? (
          <ShieldMessage tone="muted">Loading wallet balances.</ShieldMessage>
        ) : null}

        <DialogFooter>
          <Button
            className="w-full"
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

function VaultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1 truncate font-mono text-xs font-medium text-foreground tabular-nums">
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
        "px-3 py-2 text-xs md:border-r md:border-border/30 md:last:border-r-0",
        state === "active" && "bg-primary/10 text-primary",
        state === "complete" && "text-foreground",
        state === "idle" && "text-muted-foreground"
      )}
    >
      {label}
    </div>
  )
}

function RoundMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xs text-foreground tabular-nums">
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
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
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
      <div className="font-mono text-xs text-foreground tabular-nums">{value}</div>
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
