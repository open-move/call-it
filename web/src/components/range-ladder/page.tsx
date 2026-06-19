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
import { getRangeLadderPresetLabel } from "@/lib/range-ladder-products"
import type { RangeLadderProduct } from "@/lib/types/range-ladder"
import { cn } from "@/lib/utils"
import { formatPredictTradeError } from "@/services/predict-quotes"
import { executeSuiTransaction } from "@/services/predict-transactions"
import {
  getRangeLadderVaultState,
  getRangeLadderWalletState,
} from "@/services/range-ladder-client"
import type {
  RangeLadderPositionRow,
  RangeLadderVaultState,
  RangeLadderWalletState,
} from "@/services/range-ladder-client"
import {
  buildRangeLadderVaultDepositTransaction,
  buildRangeLadderVaultWithdrawTransaction,
} from "@/services/range-ladder-transactions"

export interface PageProps {
  products: RangeLadderProduct[]
}

type RangeLadderAction = "deposit" | "withdraw"
type RoundStepId = "deposit" | "active" | "settle" | "reopened"

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
  { id: "active", label: "Rungs Active" },
  { id: "settle", label: "Settle / Close" },
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
  )} cRANGE`
}

function formatBps(value: number | bigint) {
  return `${bpsFormatter.format(Number(value) / 100)}%`
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function getVaultStatus(vault?: RangeLadderVaultState) {
  if (!vault) {
    return "Loading"
  }

  if (vault.paused) {
    return "Paused"
  }

  if (vault.activeRound) {
    return "Round active"
  }

  return "Between rounds"
}

function getWithdrawQuote(amount: bigint | null, vault?: RangeLadderVaultState) {
  if (!amount || !vault || vault.shareSupply === 0n) {
    return undefined
  }

  return (amount * vault.nav) / vault.shareSupply
}

function getDepositQuote(amount: bigint | null, vault?: RangeLadderVaultState) {
  if (!amount || !vault) {
    return undefined
  }

  if (vault.shareSupply === 0n || vault.nav === 0n) {
    return amount
  }

  return (amount * vault.shareSupply) / vault.nav
}

function getUserValue(
  wallet?: RangeLadderWalletState,
  vault?: RangeLadderVaultState
) {
  return getWithdrawQuote(wallet?.rangeShareBalance ?? null, vault) ?? 0n
}

function getRoundStage(vault?: RangeLadderVaultState): RoundStepId {
  return vault?.activeRound ? "active" : "deposit"
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

function getRoundProduct(
  vault: RangeLadderVaultState | undefined,
  products: RangeLadderProduct[]
) {
  const oracleId = vault?.activeRound?.oracleId

  if (!oracleId) {
    return undefined
  }

  return products.find((product) => product.market.oracleId === oracleId)
}

function getNextLadder(products: RangeLadderProduct[]) {
  return products.find((product) => product.market.expiryMs > Date.now())
}

function getInvalidReason({
  action,
  actionBalance,
  canUseVault,
  isLoadingWallet,
  parsedAmount,
  vault,
  walletAddress,
}: {
  action: RangeLadderAction
  actionBalance?: bigint
  canUseVault: boolean
  isLoadingWallet: boolean
  parsedAmount: bigint | null
  vault?: RangeLadderVaultState
  walletAddress?: string
}) {
  if (!walletAddress) {
    return "Connect wallet to use Range Ladder."
  }

  if (!vault) {
    return "Range Ladder vault is still loading."
  }

  if (!canUseVault) {
    return "Deposits and withdrawals are open only between Range Ladder rounds."
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
      : "Withdrawal exceeds cRANGE balance."
  }

  return undefined
}

export function Page({ products }: PageProps) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const walletAddress = primaryWallet?.address
  const refreshRoute = useAppRouteRefresh()
  const [vault, setVault] = useState<RangeLadderVaultState | undefined>()
  const [wallet, setWallet] = useState<RangeLadderWalletState | undefined>()
  const [isLoadingVault, setIsLoadingVault] = useState(true)
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)
  const [action, setAction] = useState<RangeLadderAction>("deposit")
  const [dialogAction, setDialogAction] = useState<RangeLadderAction>()
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState<string | undefined>()
  const [messageTone, setMessageTone] = useState<"error" | "muted">("muted")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const parsedAmount = parseDecimalUnits(amount, PREDICT_QUOTE_DECIMALS)
  const depositQuote = getDepositQuote(parsedAmount, vault)
  const withdrawQuote = getWithdrawQuote(parsedAmount, vault)
  const status = getVaultStatus(vault)
  const userValue = getUserValue(wallet, vault)
  const activeRoundProduct = getRoundProduct(vault, products)
  const nextLadder = getNextLadder(products)
  const canUseVault = !!vault && !vault.paused && !vault.activeRound
  const actionBalance =
    action === "deposit" ? wallet?.dusdcBalance : wallet?.rangeShareBalance
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
    vault,
    walletAddress,
  })

  async function refreshVault() {
    setIsLoadingVault(true)

    try {
      const nextVault = await getRangeLadderVaultState()

      setVault(nextVault)
      setMessage(undefined)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to load Range Ladder"
      )
      setMessageTone("error")
    } finally {
      setIsLoadingVault(false)
    }
  }

  async function refreshWallet(address: string) {
    setIsLoadingWallet(true)

    try {
      setWallet(await getRangeLadderWalletState(address))
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
        : (wallet?.rangeShareBalance ?? 0n)

    setAmount(formatDecimalUnits(maxAmount, PREDICT_QUOTE_DECIMALS))
    setMessage(undefined)
  }

  function openActionDialog(nextAction: RangeLadderAction) {
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
          ? await buildRangeLadderVaultDepositTransaction({
              amount: parsedAmount,
              walletAddress,
            })
          : await buildRangeLadderVaultWithdrawTransaction({
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
      setMessage(
        formatPredictTradeError(error, "Range Ladder transaction failed")
      )
      setMessageTone("error")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <RangeLadderOverviewCard
            isLoading={isLoadingVault}
            status={status}
            userValue={userValue}
            vault={vault}
          />

          <RangeLadderPositionPanel
            onOpenAction={openActionDialog}
            vault={vault}
            wallet={wallet}
            walletAddress={walletAddress}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <RoundProgressCard
            nextLadder={nextLadder}
            product={activeRoundProduct}
            status={status}
            vault={vault}
          />
          <RangeLadderPolicyCard vault={vault} />
        </div>
      </section>

      <RangeLadderActionDialog
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

function RangeLadderOverviewCard({
  isLoading,
  status,
  userValue,
  vault,
}: {
  isLoading: boolean
  status: string
  userValue: bigint
  vault?: RangeLadderVaultState
}) {
  return (
    <Card className="h-full gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">Range Ladder Overview</CardTitle>
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
            label="Active Rungs"
            value={vault?.activeRound ? vault.activeRound.positionCount.toString() : "0"}
          />
          <VaultStat
            label="Premium Budget"
            value={vault ? formatBps(vault.policy.premiumBudgetBps) : "--"}
          />
          <VaultStat label="Your Value" value={formatDusdc(userValue)} />
          <VaultStat label="Status" value={status} />
        </div>

        <div className="mt-3 rounded-md bg-muted/40 px-3 py-3">
          <div className="text-xs font-medium text-foreground">
            What Range Ladder does
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            DUSDC deposits mint cRANGE vault shares. Between rounds the vault
            holds DUSDC cash; during a round a keeper can deploy premium across
            multiple Predict range rungs. Deposits and withdrawals reopen after
            the active ladder is closed.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function RangeLadderPositionPanel({
  onOpenAction,
  vault,
  wallet,
  walletAddress,
}: {
  onOpenAction: (action: RangeLadderAction) => void
  vault?: RangeLadderVaultState
  wallet?: RangeLadderWalletState
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
              <div className="text-xs text-muted-foreground">Range value</div>
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
                label="cRANGE"
                value={wallet ? formatShares(wallet.rangeShareBalance) : "--"}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center text-sm">
            <p className="text-center text-muted-foreground">
              Connect wallet to view your Range Ladder position.
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
  nextLadder,
  product,
  status,
  vault,
}: {
  nextLadder?: RangeLadderProduct
  product?: RangeLadderProduct
  status: string
  vault?: RangeLadderVaultState
}) {
  const round = vault?.activeRound
  const activeStep = getRoundStage(vault)
  const contextProduct = product ?? nextLadder

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
            label="Rungs"
            value={round ? round.positionCount.toString() : "--"}
          />
          <RoundMetric
            label="Premium"
            value={round ? formatDusdc(round.totalCost, 4) : "--"}
          />
        </div>

        {round ? <ActiveRungRail positions={round.positions} /> : null}

        {contextProduct ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/35 px-3 py-2">
            <AssetIcon
              assetIconUrl={contextProduct.market.assetIconUrl}
              assetName={contextProduct.market.assetName}
              assetSymbol={contextProduct.market.assetSymbol}
              className="size-6"
            />
            <div className="min-w-0">
              <div className="truncate text-xs text-foreground">
                {contextProduct.market.assetSymbol} ladder context
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums uppercase">
                {formatExpiryDistance(contextProduct.market.expiryMs)} · {getRangeLadderPresetLabel(contextProduct.preset)} · {contextProduct.rungs.length} rungs
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RangeLadderPolicyCard({ vault }: { vault?: RangeLadderVaultState }) {
  return (
    <Card className="gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">Vault Policy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        <PolicyRow
          label="Premium Budget"
          value={vault ? formatBps(vault.policy.premiumBudgetBps) : "--"}
        />
        <PolicyRow
          label="Reserve"
          value={vault ? formatBps(vault.policy.reserveBps) : "--"}
        />
        <PolicyRow
          label="Max Range Ask"
          value={vault ? formatBps(vault.policy.maxRangeAskBps) : "--"}
        />
        <PolicyRow
          label="Max Rung Count"
          value={vault ? vault.policy.maxRungCount.toString() : "--"}
        />
      </CardContent>
    </Card>
  )
}

function RangeLadderActionDialog({
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
  action: RangeLadderAction
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
  vault?: RangeLadderVaultState
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
            {isDeposit ? "Deposit DUSDC" : "Withdraw cRANGE"}
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
              <span>{isDeposit ? "DUSDC" : "cRANGE"}</span>
            </div>
          </div>
        </label>

        <div className="space-y-2.5 rounded-md bg-muted px-3 py-3">
          <PanelRow
            label={isDeposit ? "DUSDC balance" : "cRANGE balance"}
            value={
              actionBalance === undefined
                ? "--"
                : isDeposit
                  ? formatDusdc(actionBalance, 4)
                  : formatShares(actionBalance)
            }
          />
          <PanelRow
            label={isDeposit ? "Est. cRANGE" : "Est. DUSDC"}
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

        {message ? <RangeMessage tone={messageTone}>{message}</RangeMessage> : null}
        {!message && invalidReason ? (
          <RangeMessage tone="muted">{invalidReason}</RangeMessage>
        ) : null}
        {!message && !invalidReason && isLoadingWallet ? (
          <RangeMessage tone="muted">Loading wallet balances.</RangeMessage>
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

function ActiveRungRail({ positions }: { positions: RangeLadderPositionRow[] }) {
  return (
    <div className="space-y-2">
      {positions.map((position) => (
        <div
          className="grid gap-2 rounded-md bg-muted/35 px-2.5 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_7rem_7rem] sm:items-center"
          key={`${position.oracleId}-${position.lowerStrike}-${position.higherStrike}`}
        >
          <div className="font-mono text-foreground tabular-nums">
            {formatUsd(position.lowerStrikeUsd, 0)}-{formatUsd(position.higherStrikeUsd, 0)}
          </div>
          <div className="font-mono text-muted-foreground tabular-nums sm:text-right">
            qty {formatDusdc(position.quantity, 4)}
          </div>
          <div className="font-mono text-muted-foreground tabular-nums sm:text-right">
            cost {formatDusdc(position.cost, 4)}
          </div>
        </div>
      ))}
    </div>
  )
}

function RangeMessage({
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
