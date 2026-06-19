import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { AlertCircleIcon, CheckCircle2Icon, ClockIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { AssetIcon } from "@/components/shared/market/asset-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatDecimalUnits, parseDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS, SHIELD_VAULT_ID } from "@/lib/config"
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
  return `${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)} cSHIELD`
}

function formatBps(value: number | bigint) {
  return `${bpsFormatter.format(Number(value) / 100)}%`
}

function getVaultStatus(vault?: ShieldVaultState) {
  if (!SHIELD_VAULT_ID) {
    return "Setup"
  }

  if (!vault) {
    return "Loading"
  }

  if (vault.paused) {
    return "Paused"
  }

  if (vault.activeRound?.settled) {
    return "Round closed"
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

function getUserValue(wallet?: ShieldWalletState, vault?: ShieldVaultState) {
  return getWithdrawQuote(wallet?.shieldShareBalance ?? null, vault) ?? 0n
}

function getAllocationRows(vault?: ShieldVaultState) {
  if (!vault || vault.nav === 0n) {
    return [
      { label: "Cash reserve", tone: "cash", value: 0 },
      { label: "Hedge budget", tone: "hedge", value: 0 },
      { label: "PLP deployment", tone: "plp", value: 0 },
    ]
  }

  const cash = Number((vault.cash * 10_000n) / vault.nav) / 10_000
  const plp = Number((vault.plpCostBasis * 10_000n) / vault.nav) / 10_000

  return [
    { label: "Cash reserve", tone: "cash", value: cash },
    {
      label: "Hedge budget",
      tone: "hedge",
      value: vault.policy.hedgeBudgetBps / 10_000,
    },
    { label: "PLP deployment", tone: "plp", value: plp },
  ]
}

function getNextCoverage(products: ShieldProduct[]) {
  return products.find((product) => product.market.expiryMs > Date.now())
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
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState<string | undefined>()
  const [messageTone, setMessageTone] = useState<"error" | "muted">("muted")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const parsedAmount = parseDecimalUnits(amount, PREDICT_QUOTE_DECIMALS)
  const withdrawQuote = getWithdrawQuote(parsedAmount, vault)
  const status = getVaultStatus(vault)
  const userValue = getUserValue(wallet, vault)
  const nextCoverage = getNextCoverage(products)
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
          <ShieldStatsCard
            isLoading={isLoadingVault}
            nextCoverage={nextCoverage}
            status={status}
            userValue={userValue}
            vault={vault}
          />

          <ShieldPositionPanel
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

        <ShieldAccountingCard vault={vault} />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <ShieldRoundCard nextCoverage={nextCoverage} vault={vault} />
          <ShieldPolicyCard vault={vault} />
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

  if (!SHIELD_VAULT_ID) {
    return "Shield vault is not initialized yet."
  }

  if (!vault) {
    return "Shield vault is still loading."
  }

  if (!canUseVault) {
    return status === "Round closed"
      ? "This Shield round is closed. New deposits require the next round."
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

function ShieldStatsCard({
  isLoading,
  nextCoverage,
  status,
  userValue,
  vault,
}: {
  isLoading: boolean
  nextCoverage?: ShieldProduct
  status: string
  userValue: bigint
  vault?: ShieldVaultState
}) {
  return (
    <Card className="h-full gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Managed hedge vault
            </div>
            <CardTitle className="mt-1 text-xl font-medium tracking-tight">
              Shield
            </CardTitle>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Deposit DUSDC into one managed vault. Shield allocates between cash,
              Predict PLP, and a capped downside hedge for each round.
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
            value={vault ? `${sharePriceFormatter.format(vault.sharePrice)} DUSDC` : "--"}
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
                DUSDC enters as cSHIELD shares. A keeper starts a single round,
                closes deposits, deploys the hedge and PLP, then settles the
                round when the oracle resolves.
              </div>
            </div>
            {nextCoverage ? (
              <div className="flex shrink-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2">
                <AssetIcon
                  assetIconUrl={nextCoverage.market.assetIconUrl}
                  assetName={nextCoverage.market.assetName}
                  assetSymbol={nextCoverage.market.assetSymbol}
                  className="size-6"
                />
                <div className="min-w-0">
                  <div className="text-xs text-foreground">
                    {nextCoverage.market.assetSymbol} coverage context
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums uppercase">
                    {formatExpiryDistance(nextCoverage.market.expiryMs)} · spot {formatUsd(nextCoverage.market.currentPriceUsd, 0)}
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

function ShieldPositionPanel({
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
  action: ShieldAction
  amount: string
  canSubmit: boolean
  invalidReason?: string
  isLoadingWallet: boolean
  isSubmitting: boolean
  message?: string
  messageTone: "error" | "muted"
  onActionChange: (action: ShieldAction) => void
  onAmountChange: (amount: string) => void
  onConnect: () => void
  onMaxAmount?: () => void
  onSubmit: () => void
  status: string
  vault?: ShieldVaultState
  wallet?: ShieldWalletState
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
      ? "cSHIELD minted at current share price"
      : withdrawQuote
        ? `${formatDusdc(withdrawQuote)} estimated out`
        : "DUSDC estimated out"

  return (
    <Card className="h-full gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-end justify-between gap-3">
          <CardTitle className="text-sm font-medium">Shield Shares</CardTitle>
          <div className="font-mono text-xs text-muted-foreground tabular-nums">
            {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "No wallet"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <div>
          <div className="text-xs text-muted-foreground">Your Shield value</div>
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
            label="cSHIELD"
            value={wallet ? formatShares(wallet.shieldShareBalance) : "--"}
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
            <label className="text-xs text-muted-foreground" htmlFor="shield-amount">
              {action === "deposit" ? "DUSDC amount" : "cSHIELD amount"}
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
            id="shield-amount"
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
          <ShieldMessage tone="muted">{invalidReason}</ShieldMessage>
        ) : null}
        {message ? <ShieldMessage tone={messageTone}>{message}</ShieldMessage> : null}
        {isLoadingWallet ? <ShieldMessage tone="muted">Loading wallet balances.</ShieldMessage> : null}
        <ShieldMessage tone="muted">
          {status === "Open"
            ? "Vault is open for deposits and withdrawals."
            : "Vault share actions are closed for the current Shield round."}
        </ShieldMessage>
      </CardContent>
    </Card>
  )
}

function ShieldAccountingCard({ vault }: { vault?: ShieldVaultState }) {
  const rows = getAllocationRows(vault)

  return (
    <Card className="gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-end justify-between gap-3">
          <CardTitle className="text-sm font-medium">Vault Accounting</CardTitle>
          <div className="font-mono text-xs text-muted-foreground tabular-nums">
            NAV = cash + PLP cost basis
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <div className="grid gap-2 lg:grid-cols-3">
          <AccountingMetric label="Cash" value={vault ? formatDusdc(vault.cash) : "--"} />
          <AccountingMetric
            label="PLP Cost Basis"
            value={vault ? formatDusdc(vault.plpCostBasis) : "--"}
          />
          <AccountingMetric
            label="PLP Shares"
            value={vault ? formatDecimalUnits(vault.plpAmount, PREDICT_QUOTE_DECIMALS, 4) : "--"}
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
          <FlowStep label="Hedge + PLP deployed" state={vault?.activeRound && !vault.activeRound.settled ? "active" : "idle"} />
          <FlowDivider />
          <FlowStep label="Round closed" state={vault?.activeRound?.settled ? "active" : "idle"} />
        </div>
      </CardContent>
    </Card>
  )
}

function ShieldRoundCard({
  nextCoverage,
  vault,
}: {
  nextCoverage?: ShieldProduct
  vault?: ShieldVaultState
}) {
  const round = vault?.activeRound

  return (
    <Card className="gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-end justify-between gap-3">
          <CardTitle className="text-sm font-medium">Current Round</CardTitle>
          <div className="font-mono text-xs text-muted-foreground tabular-nums">
            {round ? (round.settled ? "closed" : "live") : "no active round"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {round ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <RoundMetric label="Oracle" value={`${round.oracleId.slice(0, 6)}...${round.oracleId.slice(-4)}`} />
            <RoundMetric label="Trigger" value={`Below ${formatUsd(round.strikeUsd, 0)}`} />
            <RoundMetric label="Hedge" value={formatDusdc(round.hedgeQuantity, 4)} />
            <RoundMetric label="State" value={round.settled ? "Round closed" : "Hedge live"} />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/60 bg-background/30 p-3 text-sm text-muted-foreground">
            No active Shield round. The next round is started by the keeper after
            deposits are ready; closed rounds are not reopened.
          </div>
        )}

        {nextCoverage ? (
          <div className="mt-3 rounded-md bg-muted/40 p-3">
            <div className="text-xs font-medium text-foreground">
              Next coverage context
            </div>
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
              <RoundMetric label="Asset" value={nextCoverage.market.assetSymbol} />
              <RoundMetric label="Expiry" value={formatExpiryTime(nextCoverage.market.expiryMs)} />
              <RoundMetric label="Spot" value={formatUsd(nextCoverage.market.currentPriceUsd, 0)} />
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
        <CardTitle className="text-sm font-medium">Strategy Policy</CardTitle>
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

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Open"
      ? "text-emerald-500 bg-emerald-500/10"
      : status === "Round active"
        ? "text-primary bg-primary/10"
        : status === "Round closed"
          ? "text-amber-500 bg-amber-500/10"
          : "text-muted-foreground bg-muted/60"
  const Icon = status === "Open" ? CheckCircle2Icon : status === "Setup" ? AlertCircleIcon : ClockIcon

  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs", tone)}>
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
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_4rem] items-center gap-3 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "cash" && "bg-blue-500/70",
            tone === "hedge" && "bg-outcome-down/80",
            tone === "plp" && "bg-emerald-500/70"
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

function FlowStep({ label, state }: { label: string; state: "active" | "closed" | "idle" }) {
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

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/35 pb-2 last:border-b-0 last:pb-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-xs text-foreground tabular-nums">{value}</div>
    </div>
  )
}
