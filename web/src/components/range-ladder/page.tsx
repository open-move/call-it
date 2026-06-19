import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  Layers3Icon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { AssetIcon } from "@/components/shared/market/asset-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatDecimalUnits, parseDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS, RANGE_LADDER_VAULT_ID } from "@/lib/config"
import {
  formatExpiryDistance,
  formatExpiryTime,
  formatUsd,
} from "@/lib/format"
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

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  style: "percent",
})

const bpsFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

const sharePriceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
  minimumFractionDigits: 6,
})

function formatDusdc(value: bigint, maximumFractionDigits = 2) {
  return `${formatDecimalUnits(
    value,
    PREDICT_QUOTE_DECIMALS,
    maximumFractionDigits
  )} DUSDC`
}

function formatShares(value: bigint) {
  return `${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)} cRANGE`
}

function formatBps(value: number | bigint) {
  return `${bpsFormatter.format(Number(value) / 100)}%`
}

function getVaultStatus(vault?: RangeLadderVaultState) {
  if (!RANGE_LADDER_VAULT_ID) {
    return "Setup"
  }

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

function getUserValue(
  wallet?: RangeLadderWalletState,
  vault?: RangeLadderVaultState
) {
  return getWithdrawQuote(wallet?.rangeShareBalance ?? null, vault) ?? 0n
}

function getAllocationRows(vault?: RangeLadderVaultState) {
  if (!vault) {
    return [
      { label: "Reserve target", tone: "reserve", value: 0 },
      { label: "Premium budget", tone: "premium", value: 0 },
      { label: "Between-round cash", tone: "cash", value: 0 },
    ]
  }

  const reserve = vault.policy.reserveBps / 10_000
  const premium = vault.policy.premiumBudgetBps / 10_000

  return [
    { label: "Reserve target", tone: "reserve", value: reserve },
    { label: "Premium budget", tone: "premium", value: premium },
    {
      label: "Between-round cash",
      tone: "cash",
      value: Math.max(0, 1 - reserve - premium),
    },
  ]
}

function getNextLadder(products: RangeLadderProduct[]) {
  return products.find((product) => product.market.expiryMs > Date.now())
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
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState<string | undefined>()
  const [messageTone, setMessageTone] = useState<"error" | "muted">("muted")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const parsedAmount = parseDecimalUnits(amount, PREDICT_QUOTE_DECIMALS)
  const withdrawQuote = getWithdrawQuote(parsedAmount, vault)
  const status = getVaultStatus(vault)
  const userValue = getUserValue(wallet, vault)
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
    status,
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
          <RangeLadderStatsCard
            isLoading={isLoadingVault}
            nextLadder={nextLadder}
            status={status}
            userValue={userValue}
            vault={vault}
          />

          <RangeLadderPositionPanel
            action={action}
            amount={amount}
            canSubmit={canSubmit}
            invalidReason={invalidReason}
            isLoadingWallet={isLoadingWallet}
            isSubmitting={isSubmitting}
            message={message}
            messageTone={messageTone}
            onActionChange={setAction}
            onAmountChange={setAmount}
            onConnect={() => setShowAuthFlow(true)}
            onMaxAmount={wallet ? handleMaxAmount : undefined}
            onSubmit={handleSubmit}
            status={status}
            vault={vault}
            wallet={wallet}
            walletAddress={walletAddress}
            withdrawQuote={withdrawQuote}
          />
        </div>

        <RangeLadderAccountingCard vault={vault} />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <RangeLadderRoundCard nextLadder={nextLadder} vault={vault} />
          <RangeLadderPolicyCard vault={vault} />
        </div>
      </section>
    </main>
  )
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
  status: string
  vault?: RangeLadderVaultState
  walletAddress?: string
}) {
  if (!walletAddress) {
    return "Connect wallet to use Range Ladder."
  }

  if (!RANGE_LADDER_VAULT_ID) {
    return "Range Ladder vault is not initialized yet."
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

function RangeLadderStatsCard({
  isLoading,
  nextLadder,
  status,
  userValue,
  vault,
}: {
  isLoading: boolean
  nextLadder?: RangeLadderProduct
  status: string
  userValue: bigint
  vault?: RangeLadderVaultState
}) {
  return (
    <Card className="h-full gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Managed range vault
            </div>
            <CardTitle className="mt-1 flex items-center gap-2 text-xl font-medium tracking-tight">
              <Layers3Icon className="size-4 text-primary" />
              Range Ladder
            </CardTitle>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Deposit DUSDC into one managed vault. A keeper deploys premium into
              multiple Predict range rungs, then settled rounds are closed and
              swept back into cash.
            </p>
          </div>

          <StatusPill status={status} />
        </div>
      </CardHeader>
      <CardContent className="px-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-2 lg:grid-cols-4">
          <VaultStat
            label="NAV"
            value={vault ? formatDusdc(vault.nav) : isLoading ? "--" : "Setup"}
          />
          <VaultStat
            label="Share Price"
            value={
              vault
                ? `${sharePriceFormatter.format(vault.sharePrice)} DUSDC`
                : "--"
            }
          />
          <VaultStat label="Your Value" value={formatDusdc(userValue)} />
          <VaultStat
            label="Share Supply"
            value={vault ? formatShares(vault.shareSupply) : "--"}
          />
        </div>

        <div className="mt-2 rounded-md border border-border/40 bg-background/35 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                Current vault lane
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                DUSDC mints cRANGE between rounds. During a round, deposits close
                and premium is deployed across range bands. After settlement, the
                round is closed and a new round may be started.
              </div>
            </div>
            {nextLadder ? (
              <div className="flex shrink-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2">
                <AssetIcon
                  assetIconUrl={nextLadder.market.assetIconUrl}
                  assetName={nextLadder.market.assetName}
                  assetSymbol={nextLadder.market.assetSymbol}
                  className="size-6"
                />
                <div className="min-w-0">
                  <div className="text-xs text-foreground">
                    {nextLadder.market.assetSymbol} ladder context
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums uppercase">
                    {formatExpiryDistance(nextLadder.market.expiryMs)} · {nextLadder.rungs.length} ranges
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RangeLadderPositionPanel({
  action,
  amount,
  canSubmit,
  invalidReason,
  isLoadingWallet,
  isSubmitting,
  message,
  messageTone,
  onActionChange,
  onAmountChange,
  onConnect,
  onMaxAmount,
  onSubmit,
  status,
  vault,
  wallet,
  walletAddress,
  withdrawQuote,
}: {
  action: RangeLadderAction
  amount: string
  canSubmit: boolean
  invalidReason?: string
  isLoadingWallet: boolean
  isSubmitting: boolean
  message?: string
  messageTone: "error" | "muted"
  onActionChange: (action: RangeLadderAction) => void
  onAmountChange: (amount: string) => void
  onConnect: () => void
  onMaxAmount?: () => void
  onSubmit: () => void
  status: string
  vault?: RangeLadderVaultState
  wallet?: RangeLadderWalletState
  walletAddress?: string
  withdrawQuote?: bigint
}) {
  const buttonLabel = !walletAddress
    ? "Sign in"
    : isSubmitting
      ? action === "deposit"
        ? "Depositing"
        : "Withdrawing"
      : action === "deposit"
        ? "Deposit"
        : "Withdraw"
  const walletValue = getUserValue(wallet, vault)
  const estimatedOutput =
    action === "deposit"
      ? "cRANGE minted at current share price"
      : withdrawQuote
        ? `${formatDusdc(withdrawQuote)} estimated out`
        : "DUSDC estimated out"

  return (
    <Card className="h-full gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-end justify-between gap-3">
          <CardTitle className="text-sm font-medium">Range Shares</CardTitle>
          <div className="font-mono text-xs text-muted-foreground tabular-nums">
            {walletAddress
              ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
              : "No wallet"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <div>
          <div className="text-xs text-muted-foreground">Your Range value</div>
          <div className="mt-1 font-mono text-2xl font-medium tracking-tight text-foreground tabular-nums">
            {walletAddress ? formatDusdc(walletValue) : "--"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <BalanceTile
            label="DUSDC"
            value={wallet ? formatDusdc(wallet.dusdcBalance, 4) : "--"}
          />
          <BalanceTile
            label="cRANGE"
            value={wallet ? formatShares(wallet.rangeShareBalance) : "--"}
          />
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/50 p-1">
          <Button
            className={cn(
              "h-8 text-xs shadow-none",
              action === "deposit"
                ? "bg-background text-foreground hover:bg-background"
                : "bg-transparent text-muted-foreground hover:bg-background/60"
            )}
            onClick={() => onActionChange("deposit")}
            size="sm"
            type="button"
            variant="ghost"
          >
            Deposit
          </Button>
          <Button
            className={cn(
              "h-8 text-xs shadow-none",
              action === "withdraw"
                ? "bg-background text-foreground hover:bg-background"
                : "bg-transparent text-muted-foreground hover:bg-background/60"
            )}
            onClick={() => onActionChange("withdraw")}
            size="sm"
            type="button"
            variant="ghost"
          >
            Withdraw
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="range-ladder-amount"
            >
              {action === "deposit" ? "DUSDC amount" : "cRANGE amount"}
            </label>
            {onMaxAmount ? (
              <Button
                className="h-auto px-0 py-0 text-[11px] text-primary shadow-none hover:bg-transparent hover:text-primary/80"
                onClick={onMaxAmount}
                size="sm"
                type="button"
                variant="ghost"
              >
                Max
              </Button>
            ) : null}
          </div>
          <Input
            id="range-ladder-amount"
            inputMode="decimal"
            onChange={(event) => onAmountChange(event.target.value)}
            placeholder="0.00"
            value={amount}
          />
          <div className="text-xs text-muted-foreground">{estimatedOutput}</div>
        </div>

        <Button
          className="w-full shadow-none"
          disabled={!!walletAddress && (!canSubmit || isSubmitting)}
          onClick={walletAddress ? onSubmit : onConnect}
          type="button"
        >
          {buttonLabel}
        </Button>

        {invalidReason && walletAddress ? (
          <RangeMessage tone="muted">{invalidReason}</RangeMessage>
        ) : null}
        {message ? <RangeMessage tone={messageTone}>{message}</RangeMessage> : null}
        {isLoadingWallet ? (
          <RangeMessage tone="muted">Loading wallet balances.</RangeMessage>
        ) : null}
        <RangeMessage tone="muted">
          {status === "Between rounds"
            ? "Vault is open for deposits and withdrawals."
            : "Vault share actions are closed during active Range Ladder rounds."}
        </RangeMessage>
      </CardContent>
    </Card>
  )
}

function RangeLadderAccountingCard({
  vault,
}: {
  vault?: RangeLadderVaultState
}) {
  const rows = getAllocationRows(vault)

  return (
    <Card className="gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-end justify-between gap-3">
          <CardTitle className="text-sm font-medium">Vault Accounting</CardTitle>
          <div className="font-mono text-xs text-muted-foreground tabular-nums">
            NAV = cash between rounds
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <div className="grid gap-2 lg:grid-cols-3">
          <AccountingMetric label="Cash" value={vault ? formatDusdc(vault.cash) : "--"} />
          <AccountingMetric
            label="Premium Budget"
            value={vault ? formatBps(vault.policy.premiumBudgetBps) : "--"}
          />
          <AccountingMetric
            label="Active Rungs"
            value={vault?.activeRound ? vault.activeRound.positionCount.toString() : "0"}
          />
        </div>

        <div className="space-y-2">
          {rows.map((row) => (
            <AllocationRow key={row.label} {...row} />
          ))}
        </div>

        <div className="grid overflow-hidden rounded-md border border-border/40 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <FlowStep label="Deposit window" state={vault?.activeRound ? "closed" : "active"} />
          <FlowDivider />
          <FlowStep label="Range rungs live" state={vault?.activeRound ? "active" : "idle"} />
          <FlowDivider />
          <FlowStep label="Settled round closed" state="idle" />
        </div>
      </CardContent>
    </Card>
  )
}

function RangeLadderRoundCard({
  nextLadder,
  vault,
}: {
  nextLadder?: RangeLadderProduct
  vault?: RangeLadderVaultState
}) {
  const round = vault?.activeRound

  return (
    <Card className="gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-end justify-between gap-3">
          <CardTitle className="text-sm font-medium">Current Ladder</CardTitle>
          <div className="font-mono text-xs text-muted-foreground tabular-nums">
            {round ? `${round.positionCount} live rungs` : "no active round"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {round ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <RoundMetric
                label="Oracle"
                value={`${round.oracleId.slice(0, 6)}...${round.oracleId.slice(-4)}`}
              />
              <RoundMetric label="Rungs" value={round.positionCount.toString()} />
              <RoundMetric label="Premium" value={formatDusdc(round.totalCost, 4)} />
              <RoundMetric label="Quantity" value={formatDusdc(round.totalQuantity, 4)} />
            </div>
            <ActiveRungRail positions={round.positions} />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/60 bg-background/30 p-3 text-sm text-muted-foreground">
            No active Range Ladder round. Settled rounds are closed; the keeper
            starts a new round from fresh between-round vault state.
          </div>
        )}

        {nextLadder ? (
          <div className="mt-3 rounded-md bg-muted/40 p-3">
            <div className="text-xs font-medium text-foreground">
              Next ladder context
            </div>
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
              <RoundMetric label="Asset" value={nextLadder.market.assetSymbol} />
              <RoundMetric label="Expiry" value={formatExpiryTime(nextLadder.market.expiryMs)} />
              <RoundMetric
                label="Preset"
                value={getRangeLadderPresetLabel(nextLadder.preset)}
              />
            </div>
            <PreviewRungRail product={nextLadder} />
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
        <CardTitle className="text-sm font-medium">Strategy Policy</CardTitle>
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

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Between rounds"
      ? "bg-emerald-500/10 text-emerald-500"
      : status === "Round active"
        ? "bg-primary/10 text-primary"
        : "bg-muted/60 text-muted-foreground"
  const Icon =
    status === "Between rounds"
      ? CheckCircle2Icon
      : status === "Setup"
        ? AlertCircleIcon
        : ClockIcon

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
        tone
      )}
    >
      <Icon className="size-3.5" />
      {status}
    </div>
  )
}

function VaultStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function BalanceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/35 px-2.5 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-xs text-foreground tabular-nums">
        {value}
      </div>
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
        "rounded-md px-2.5 py-2 text-xs leading-5",
        tone === "error"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted/50 text-muted-foreground"
      )}
    >
      {children}
    </div>
  )
}

function AccountingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/35 px-2.5 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function AllocationRow({
  label,
  tone,
  value,
}: {
  label: string
  tone: string
  value: number
}) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)_4rem] items-center gap-3 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "reserve" && "bg-blue-500/70",
            tone === "premium" && "bg-primary/75",
            tone === "cash" && "bg-emerald-500/70"
          )}
          style={{ width: `${Math.max(0, Math.min(value, 1)) * 100}%` }}
        />
      </div>
      <div className="text-right font-mono text-foreground tabular-nums">
        {percentFormatter.format(value)}
      </div>
    </div>
  )
}

function FlowStep({
  label,
  state,
}: {
  label: string
  state: "active" | "closed" | "idle"
}) {
  return (
    <div
      className={cn(
        "px-3 py-2 text-xs",
        state === "active" && "bg-primary/10 text-primary",
        state === "closed" && "bg-muted/50 text-muted-foreground",
        state === "idle" && "text-muted-foreground"
      )}
    >
      {label}
    </div>
  )
}

function FlowDivider() {
  return <div className="hidden w-px bg-border/40 lg:block" />
}

function RoundMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm text-foreground tabular-nums">
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
          className="grid gap-2 rounded-md border border-border/40 bg-background/35 px-2.5 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_7rem_7rem] sm:items-center"
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

function PreviewRungRail({ product }: { product: RangeLadderProduct }) {
  return (
    <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
      {product.rungs.map((rung, index) => (
        <span
          className={cn(
            "rounded-md border border-border/40 bg-background/40 px-2 py-1 font-mono text-[10px] text-foreground tabular-nums",
            index === product.rungs.length - 1 &&
              "border-outcome-down/25 text-outcome-down"
          )}
          key={`${rung.lowerStrikeUsd}-${rung.higherStrikeUsd}`}
        >
          {formatUsd(rung.lowerStrikeUsd, 0)}-{formatUsd(rung.higherStrikeUsd, 0)}
        </span>
      ))}
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
