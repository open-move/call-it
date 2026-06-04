import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState } from "react"
import { useRevalidator } from "react-router"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { formatRelativeTime, formatUsd } from "~/lib/callit/format"
import {
  formatDecimalUnits,
  parseDecimalUnits,
} from "~/lib/callit/trading/amounts"
import {
  PREDICT_LP_ASSET,
  PREDICT_QUOTE_ASSET,
  PREDICT_QUOTE_DECIMALS,
} from "~/lib/deepbook/config"
import {
  buildSupplyLiquidityTransaction,
  buildWithdrawLiquidityTransaction,
  executeSuiTransaction,
} from "~/lib/deepbook/predict-transactions"
import { formatPredictTradeError } from "~/lib/deepbook/predict-quotes"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "~/lib/dynamic/sui-wallet"
import {
  type LpSupplyEvent,
  type LpWithdrawalEvent,
  type VaultPerformanceResponse,
  type VaultSummary,
} from "~/lib/deepbook/predict-types"
import { getSuiGrpcClient } from "~/lib/deepbook/sui-client"
import { cn } from "~/lib/utils"

export interface PageProps {
  performance: VaultPerformanceResponse
  supplies: LpSupplyEvent[]
  summary: VaultSummary
  withdrawals: LpWithdrawalEvent[]
}

type EarnAction = "supply" | "withdraw"

type LpActivity =
  | {
      account: string
      amount: number
      id: string
      shares: number
      timestampMs: number
      type: "Supply"
    }
  | {
      account: string
      amount: number
      id: string
      shares: number
      timestampMs: number
      type: "Withdraw"
    }

interface WalletBalances {
  dusdc: bigint
  plp: bigint
}

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "percent",
})

const sharePriceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
  minimumFractionDigits: 6,
})

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
})

function toQuoteUsd(value: number) {
  return value / 10 ** PREDICT_QUOTE_DECIMALS
}

function formatQuoteUsd(value: number, maximumFractionDigits = 2) {
  return formatUsd(toQuoteUsd(value), maximumFractionDigits)
}

function formatQuoteAmount(value: number, symbol = "DUSDC") {
  return `${toQuoteUsd(value).toLocaleString("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  })} ${symbol}`
}

function formatSharePrice(value: number) {
  return sharePriceFormatter.format(value)
}

function formatPercent(value: number) {
  return percentFormatter.format(value)
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function getActivity(
  supplies: LpSupplyEvent[],
  withdrawals: LpWithdrawalEvent[]
) {
  const supplyActivity = supplies.map((event) => ({
    account: event.supplier,
    amount: event.amount,
    id: event.event_digest,
    shares: event.shares_minted,
    timestampMs: event.checkpoint_timestamp_ms,
    type: "Supply" as const,
  }))
  const withdrawalActivity = withdrawals.map((event) => ({
    account: event.withdrawer,
    amount: event.amount,
    id: event.event_digest,
    shares: event.shares_burned,
    timestampMs: event.checkpoint_timestamp_ms,
    type: "Withdraw" as const,
  }))

  return [...supplyActivity, ...withdrawalActivity]
    .sort((first, second) => second.timestampMs - first.timestampMs)
    .slice(0, 10)
}

function getPerformanceReturn(performance: VaultPerformanceResponse) {
  const firstPoint = performance.points[0]
  const lastPoint = performance.points.at(-1)

  if (!firstPoint || !lastPoint || firstPoint.share_price === 0) {
    return 0
  }

  return lastPoint.share_price / firstPoint.share_price - 1
}

function getChartDomain(points: VaultPerformanceResponse["points"]) {
  if (points.length === 0) {
    return undefined
  }

  const values = points.map((point) => point.share_price)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.16, 0.00005)

  return [min - padding, max + padding] satisfies [number, number]
}

export function Page({
  performance,
  supplies,
  summary,
  withdrawals,
}: PageProps) {
  const activity = getActivity(supplies, withdrawals)
  const performanceReturn = getPerformanceReturn(performance)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="min-w-0">
            <VaultStatsCard
              performance={performance}
              performanceReturn={performanceReturn}
              summary={summary}
            />
          </section>

          <aside className="min-w-0">
            <LiquidityPanel summary={summary} />
          </aside>
        </div>

        <VaultAccountingCard summary={summary} />

        <ActivityCard activity={activity} />
      </section>
    </main>
  )
}

function VaultStatsCard({
  performance,
  performanceReturn,
  summary,
}: {
  performance: VaultPerformanceResponse
  performanceReturn: number
  summary: VaultSummary
}) {
  return (
    <Card className="h-full gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-end justify-between gap-3">
          <CardTitle className="text-sm font-medium">Vault Stats</CardTitle>
          <div className="font-mono text-sm font-medium text-foreground tabular-nums">
            {formatQuoteUsd(summary.vault_value)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-2 lg:grid-cols-4">
          <VaultStat
            label="Available"
            value={formatQuoteUsd(summary.available_withdrawal)}
          />
          <VaultStat
            label="PLP Price"
            value={`${formatSharePrice(summary.plp_share_price)} DUSDC`}
          />
          <VaultStat
            label="PLP Supply"
            value={formatQuoteAmount(summary.plp_total_supply, "PLP")}
          />
          <VaultStat
            label="Utilization"
            value={formatPercent(summary.utilization)}
          />
        </div>

        <VaultPriceChart
          performance={performance}
          performanceReturn={performanceReturn}
        />
      </CardContent>
    </Card>
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

function VaultPriceChart({
  performance,
  performanceReturn,
}: {
  performance: VaultPerformanceResponse
  performanceReturn: number
}) {
  const yDomain = getChartDomain(performance.points)

  return (
    <div className="mt-3">
      <div className="mt-3 h-60 sm:h-64">
        {performance.points.length > 0 && yDomain ? (
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart
              data={performance.points}
              margin={{ bottom: 0, left: 0, right: 10, top: 10 }}
            >
              <defs>
                <linearGradient
                  id="plpShareGradient"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="timestamp_ms"
                domain={["dataMin", "dataMax"]}
                minTickGap={34}
                scale="time"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(value) => dateFormatter.format(new Date(value))}
                tickLine={false}
                type="number"
              />
              <YAxis
                axisLine={false}
                domain={yDomain}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(value) => Number(value).toFixed(4)}
                tickLine={false}
                width={58}
              />
              <Area
                dataKey="share_price"
                fill="url(#plpShareGradient)"
                isAnimationActive={false}
                stroke="var(--chart-1)"
                strokeWidth={2}
                type="monotone"
              />
              <Line
                dataKey="share_price"
                dot={false}
                isAnimationActive={false}
                stroke="var(--chart-1)"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            No vault performance history is available yet.
          </div>
        )}
      </div>
    </div>
  )
}

function LiquidityPanel({ summary }: { summary: VaultSummary }) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <LiquidityPanelFallback summary={summary} />
  }

  return <LiquidityPanelClient summary={summary} />
}

function LiquidityPanelFallback({ summary }: { summary: VaultSummary }) {
  const [action, setAction] = useState<EarnAction>("supply")
  const [amount, setAmount] = useState("")
  const estimatedOutput = getEstimatedOutput({ action, amount, summary })

  return (
    <LiquidityPanelFrame
      action={action}
      amount={amount}
      buttonDisabled
      buttonLabel={action === "supply" ? "Supply DUSDC" : "Withdraw DUSDC"}
      estimatedOutput={estimatedOutput}
      message="Connect wallet to view balances."
      messageTone="muted"
      onActionChange={setAction}
      onAmountChange={setAmount}
      onConnect={undefined}
      onMaxAmount={undefined}
      onSubmit={() => undefined}
      summary={summary}
      walletAddress={undefined}
      walletBlock={undefined}
    />
  )
}

function LiquidityPanelClient({ summary }: { summary: VaultSummary }) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const revalidator = useRevalidator()
  const [action, setAction] = useState<EarnAction>("supply")
  const [amount, setAmount] = useState("")
  const [dialogAction, setDialogAction] = useState<EarnAction>()
  const [balances, setBalances] = useState<WalletBalances>()
  const [isLoadingBalances, setIsLoadingBalances] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const walletAddress = primaryWallet?.address
  const selectedAmount = parseDecimalUnits(amount, PREDICT_QUOTE_DECIMALS)
  const estimatedOutput = getEstimatedOutput({ action, amount, summary })
  const estimatedWithdrawAmount = selectedAmount
    ? getEstimatedWithdrawAmount(selectedAmount, summary)
    : undefined
  const canSupply =
    action === "supply" &&
    !!selectedAmount &&
    !!balances &&
    selectedAmount <= balances.dusdc
  const canWithdraw =
    action === "withdraw" &&
    !!selectedAmount &&
    !!balances &&
    selectedAmount <= balances.plp &&
    !!estimatedWithdrawAmount &&
    estimatedWithdrawAmount <= BigInt(Math.floor(summary.available_withdrawal))
  const canSubmit = action === "supply" ? canSupply : canWithdraw
  const buttonDisabled =
    isSubmitting || isLoadingBalances || (!!walletAddress && !canSubmit)
  const buttonLabel = !walletAddress
    ? "Sign in"
    : isSubmitting
      ? action === "supply"
        ? "Depositing"
        : "Withdrawing"
      : action === "supply"
        ? "Deposit"
        : "Withdraw"

  async function loadBalances(address: string) {
    const [dusdcBalance, plpBalance] = await Promise.all([
      getSuiGrpcClient().getBalance({
        coinType: PREDICT_QUOTE_ASSET,
        owner: address,
      }),
      getSuiGrpcClient().getBalance({
        coinType: PREDICT_LP_ASSET,
        owner: address,
      }),
    ])

    return {
      dusdc: BigInt(dusdcBalance.balance.balance),
      plp: BigInt(plpBalance.balance.balance),
    } satisfies WalletBalances
  }

  useEffect(() => {
    let isStale = false

    async function refreshBalances() {
      if (!walletAddress) {
        setBalances(undefined)
        return
      }

      setIsLoadingBalances(true)

      try {
        const nextBalances = await loadBalances(walletAddress)

        if (!isStale) {
          setBalances(nextBalances)
          setErrorMessage(undefined)
        }
      } catch (error) {
        if (!isStale) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to load wallet balances"
          )
        }
      } finally {
        if (!isStale) {
          setIsLoadingBalances(false)
        }
      }
    }

    void refreshBalances()

    return () => {
      isStale = true
    }
  }, [walletAddress])

  async function handleSubmit() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setErrorMessage(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    if (!selectedAmount) {
      setErrorMessage("Enter a positive amount")
      return
    }

    if (action === "supply" && balances && selectedAmount > balances.dusdc) {
      setErrorMessage("Deposit amount exceeds DUSDC balance")
      return
    }

    if (action === "withdraw") {
      if (balances && selectedAmount > balances.plp) {
        setErrorMessage("Withdraw amount exceeds PLP balance")
        return
      }

      if (
        estimatedWithdrawAmount &&
        estimatedWithdrawAmount >
          BigInt(Math.floor(summary.available_withdrawal))
      ) {
        setErrorMessage("Withdraw amount exceeds vault liquidity")
        return
      }
    }

    setIsSubmitting(true)
    setErrorMessage(undefined)

    try {
      setStatusMessage(
        action === "supply" ? "Preparing deposit" : "Preparing withdrawal"
      )
      const transaction =
        action === "supply"
          ? await buildSupplyLiquidityTransaction({
              amount: selectedAmount,
              walletAddress,
            })
          : await buildWithdrawLiquidityTransaction({
              amount: selectedAmount,
              walletAddress,
            })

      setStatusMessage(
        action === "supply" ? "Depositing DUSDC" : "Withdrawing DUSDC"
      )
      await executeSuiTransaction(signer, transaction)
      setStatusMessage(
        action === "supply" ? "Deposit confirmed" : "Withdrawal confirmed"
      )
      setAmount("")
      setDialogAction(undefined)
      setBalances(await loadBalances(walletAddress))
      revalidator.revalidate()
      window.setTimeout(() => revalidator.revalidate(), 1_500)
    } catch (error) {
      setStatusMessage(undefined)
      setErrorMessage(formatPredictTradeError(error, "Transaction failed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleMaxAmount() {
    if (!balances) {
      return
    }

    const maxAmount =
      action === "supply"
        ? balances.dusdc
        : minBigInt(balances.plp, getMaxWithdrawShares(summary))

    setAmount(formatDecimalUnits(maxAmount, PREDICT_QUOTE_DECIMALS))
    setErrorMessage(undefined)
  }

  function openActionDialog(nextAction: EarnAction) {
    setAction(nextAction)
    setDialogAction(nextAction)
    setAmount("")
    setErrorMessage(undefined)
    setStatusMessage(undefined)
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) {
      setDialogAction(undefined)
      setAmount("")
      setErrorMessage(undefined)
      setStatusMessage(undefined)
    }
  }

  const plpBalance = balances?.plp ?? 0n
  const dusdcBalance = balances?.dusdc ?? 0n
  const plpValue =
    (Number(plpBalance) / 10 ** PREDICT_QUOTE_DECIMALS) *
    summary.plp_share_price
  const dusdcBalanceValue = balances
    ? `${formatDecimalUnits(dusdcBalance, PREDICT_QUOTE_DECIMALS)} DUSDC`
    : "--"
  const plpBalanceValue = balances
    ? `${formatDecimalUnits(plpBalance, PREDICT_QUOTE_DECIMALS)} PLP`
    : "--"
  const plpValueLabel = balances ? formatUsd(plpValue) : "--"
  const actionBalanceLabel =
    action === "supply" ? "DUSDC balance" : "PLP balance"
  const actionBalanceValue =
    action === "supply" ? dusdcBalanceValue : plpBalanceValue
  const invalidReason =
    dialogAction && buttonDisabled && !isSubmitting
      ? getEarnInvalidReason({
          action,
          balances,
          estimatedWithdrawAmount,
          isLoadingBalances,
          selectedAmount,
          summary,
        })
      : undefined

  return (
    <LiquidityPanelFrame
      action={action}
      actionBalanceLabel={actionBalanceLabel}
      actionBalanceValue={actionBalanceValue}
      amount={amount}
      buttonDisabled={buttonDisabled}
      buttonLabel={buttonLabel}
      dialogOpen={dialogAction !== undefined}
      estimatedOutput={estimatedOutput}
      invalidReason={invalidReason}
      message={errorMessage ?? statusMessage}
      messageTone={errorMessage ? "error" : "muted"}
      onActionChange={setAction}
      onAmountChange={setAmount}
      onConnect={() => setShowAuthFlow(true)}
      onDialogOpenChange={handleDialogOpenChange}
      onMaxAmount={balances ? handleMaxAmount : undefined}
      onOpenAction={openActionDialog}
      onSubmit={handleSubmit}
      summary={summary}
      walletAddress={walletAddress}
      walletBlock={
        walletAddress && (
          <div className="space-y-3 pt-1">
            <div>
              <div className="text-xs text-muted-foreground">PLP value</div>
              <div className="mt-1 font-mono text-2xl font-medium tracking-tight text-foreground tabular-nums">
                {plpValueLabel}
              </div>
            </div>
            <div className="space-y-2 border-t border-border/40 pt-3">
              <PanelRow label="DUSDC" value={dusdcBalanceValue} />
              <PanelRow label="PLP" value={plpBalanceValue} />
            </div>
          </div>
        )
      }
    />
  )
}

function LiquidityPanelFrame({
  action,
  actionBalanceLabel,
  actionBalanceValue,
  amount,
  buttonDisabled,
  buttonLabel,
  dialogOpen = false,
  estimatedOutput,
  invalidReason,
  message,
  messageTone,
  onActionChange,
  onAmountChange,
  onConnect,
  onDialogOpenChange,
  onMaxAmount,
  onOpenAction,
  onSubmit,
  summary,
  walletAddress,
  walletBlock,
}: {
  action: EarnAction
  actionBalanceLabel?: string
  actionBalanceValue?: string
  amount: string
  buttonDisabled: boolean
  buttonLabel: string
  dialogOpen?: boolean
  estimatedOutput?: number
  invalidReason?: string
  message?: string
  messageTone: "error" | "muted"
  onActionChange: (action: EarnAction) => void
  onAmountChange: (amount: string) => void
  onConnect?: () => void
  onDialogOpenChange?: (open: boolean) => void
  onMaxAmount?: () => void
  onOpenAction?: (action: EarnAction) => void
  onSubmit: () => void
  summary: VaultSummary
  walletAddress?: string
  walletBlock?: React.ReactNode
}) {
  function selectAction(nextAction: EarnAction) {
    onActionChange(nextAction)
    onOpenAction?.(nextAction)
  }

  return (
    <>
      <Card className="h-full rounded-md border-0 bg-card py-0 shadow-none ring-0 xl:row-span-2">
        <CardContent className="flex h-full flex-col gap-4 px-4 py-4">
          <div>
            <div className="text-sm font-medium text-foreground">
              Your Position
            </div>
          </div>

          {walletAddress ? (
            walletBlock
          ) : (
            <div className="flex flex-1 flex-col justify-center text-sm">
              <p className="text-center text-muted-foreground">
                Connect wallet to view your position.
              </p>
              <Button
                className="mt-3 h-9 w-full"
                disabled={!onConnect}
                onClick={onConnect}
                type="button"
              >
                Sign in
              </Button>
            </div>
          )}

          {walletAddress && (
            <div className="mt-auto">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-9"
                  onClick={() => selectAction("supply")}
                  type="button"
                >
                  Deposit DUSDC
                </Button>
                <Button
                  className="h-9"
                  onClick={() => selectAction("withdraw")}
                  type="button"
                  variant="outline"
                >
                  Withdraw
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <EarnActionDialog
        action={action}
        actionBalanceLabel={actionBalanceLabel}
        actionBalanceValue={actionBalanceValue}
        amount={amount}
        buttonDisabled={buttonDisabled}
        buttonLabel={buttonLabel}
        estimatedOutput={estimatedOutput}
        invalidReason={invalidReason}
        message={message}
        messageTone={messageTone}
        onAmountChange={onAmountChange}
        onMaxAmount={onMaxAmount}
        onOpenChange={onDialogOpenChange}
        onSubmit={onSubmit}
        open={dialogOpen}
        summary={summary}
      />
    </>
  )
}

function EarnActionDialog({
  action,
  actionBalanceLabel,
  actionBalanceValue,
  amount,
  buttonDisabled,
  buttonLabel,
  estimatedOutput,
  invalidReason,
  message,
  messageTone,
  onAmountChange,
  onMaxAmount,
  onOpenChange,
  onSubmit,
  open,
  summary,
}: {
  action: EarnAction
  actionBalanceLabel?: string
  actionBalanceValue?: string
  amount: string
  buttonDisabled: boolean
  buttonLabel: string
  estimatedOutput?: number
  invalidReason?: string
  message?: string
  messageTone: "error" | "muted"
  onAmountChange: (amount: string) => void
  onMaxAmount?: () => void
  onOpenChange?: (open: boolean) => void
  onSubmit: () => void
  open: boolean
  summary: VaultSummary
}) {
  return (
    <Dialog onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)} open={open}>
      <DialogContent className="gap-5 rounded-md bg-card p-5 sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm font-medium">
            {action === "supply" ? "Deposit DUSDC" : "Withdraw PLP"}
          </DialogTitle>
        </DialogHeader>

        <label className="block space-y-2">
          <span className="text-xs text-muted-foreground">Amount</span>
          <div className="relative">
            <Input
              className="h-10 border-0 pr-28 font-mono text-sm shadow-none ring-0 focus-visible:ring-1"
              inputMode="decimal"
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="0.00"
              value={amount}
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-2 text-xs text-muted-foreground">
              <Button
                className="h-6 px-2 font-mono text-[10px]"
                disabled={!onMaxAmount}
                onClick={onMaxAmount}
                type="button"
                variant="ghost"
              >
                MAX
              </Button>
              <span>{action === "supply" ? "DUSDC" : "PLP"}</span>
            </div>
          </div>
        </label>

        <div className="space-y-2.5 rounded-md bg-muted px-3 py-3">
          {actionBalanceLabel && actionBalanceValue && (
            <PanelRow label={actionBalanceLabel} value={actionBalanceValue} />
          )}
          <PanelRow
            label={action === "supply" ? "Est. PLP" : "Est. DUSDC"}
            value={
              estimatedOutput === undefined
                ? "--"
                : estimatedOutput.toLocaleString("en-US", {
                    maximumFractionDigits: 6,
                  })
            }
          />
          <PanelRow
            label="PLP price"
            value={formatSharePrice(summary.plp_share_price)}
          />
          {action === "withdraw" && (
            <PanelRow
              label="Vault available"
              value={formatQuoteUsd(summary.available_withdrawal)}
            />
          )}
        </div>

        {message && (
          <p
            className={cn(
              "rounded-md px-3 py-2 text-xs leading-5",
              messageTone === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground"
            )}
          >
            {message}
          </p>
        )}

        {!message && invalidReason && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
            {invalidReason}
          </p>
        )}

        <DialogFooter>
          <Button
            className="h-10 w-full"
            disabled={buttonDisabled}
            onClick={onSubmit}
            type="button"
          >
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function getEstimatedOutput({
  action,
  amount,
  summary,
}: {
  action: EarnAction
  amount: string
  summary: VaultSummary
}) {
  const numericAmount = Number(amount)
  const isValidAmount = Number.isFinite(numericAmount) && numericAmount > 0

  if (!isValidAmount) {
    return undefined
  }

  return action === "supply"
    ? numericAmount / summary.plp_share_price
    : numericAmount * summary.plp_share_price
}

function getEstimatedWithdrawAmount(amount: bigint, summary: VaultSummary) {
  const totalSupply = BigInt(Math.floor(summary.plp_total_supply))

  if (totalSupply === 0n) {
    return 0n
  }

  return (amount * BigInt(Math.floor(summary.vault_value))) / totalSupply
}

function getEarnInvalidReason({
  action,
  balances,
  estimatedWithdrawAmount,
  isLoadingBalances,
  selectedAmount,
  summary,
}: {
  action: EarnAction
  balances?: WalletBalances
  estimatedWithdrawAmount?: bigint
  isLoadingBalances: boolean
  selectedAmount: bigint | null
  summary: VaultSummary
}) {
  if (!selectedAmount) {
    return "Enter an amount"
  }

  if (isLoadingBalances || !balances) {
    return "Loading balances"
  }

  if (action === "supply") {
    return selectedAmount > balances.dusdc ? "Exceeds DUSDC balance" : undefined
  }

  if (selectedAmount > balances.plp) {
    return "Exceeds PLP balance"
  }

  if (estimatedWithdrawAmount === undefined || estimatedWithdrawAmount === 0n) {
    return "Vault liquidity unavailable"
  }

  return estimatedWithdrawAmount >
    BigInt(Math.floor(summary.available_withdrawal))
    ? "Exceeds vault liquidity"
    : undefined
}

function getMaxWithdrawShares(summary: VaultSummary) {
  const vaultValue = BigInt(Math.floor(summary.vault_value))

  if (vaultValue === 0n) {
    return 0n
  }

  return (
    (BigInt(Math.floor(summary.available_withdrawal)) *
      BigInt(Math.floor(summary.plp_total_supply))) /
    vaultValue
  )
}

function minBigInt(first: bigint, second: bigint) {
  return first < second ? first : second
}

function VaultAccountingCard({ summary }: { summary: VaultSummary }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-end justify-between gap-3">
          <CardTitle className="text-sm font-medium">
            Vault Accounting
          </CardTitle>
          <div className="font-mono text-sm font-medium text-foreground tabular-nums">
            {formatQuoteUsd(summary.net_deposits)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 px-3 py-3 md:grid-cols-2">
        <div className="space-y-2">
          <PanelRow
            label="Vault balance"
            value={formatQuoteUsd(summary.vault_balance)}
          />
          <PanelRow
            label="Total MTM"
            value={formatQuoteUsd(summary.total_mtm)}
          />
          <PanelRow
            label="Max payout"
            value={formatQuoteUsd(summary.total_max_payout)}
          />
          <PanelRow
            label="Payout util"
            value={formatPercent(summary.max_payout_utilization)}
          />
        </div>
        <div className="space-y-2 border-t border-border/40 pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
          <PanelRow
            label="Available liquidity"
            value={formatQuoteUsd(summary.available_liquidity)}
          />
          <PanelRow
            label="Total supplied"
            value={formatQuoteUsd(summary.total_supplied)}
          />
          <PanelRow
            label="Total withdrawn"
            value={formatQuoteUsd(summary.total_withdrawn)}
          />
          <PanelRow
            label="Net deposits"
            value={formatQuoteUsd(summary.net_deposits)}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function ActivityCard({ activity }: { activity: LpActivity[] }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">LP Activity</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <div className="hidden border-b border-border/40 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[0.7fr_1fr_1fr_1fr_0.7fr]">
          <div>Type</div>
          <div>Account</div>
          <div className="text-right">Amount</div>
          <div className="text-right">Shares</div>
          <div className="text-right">Time</div>
        </div>
        <div className="divide-y divide-border/25">
          {activity.length > 0 ? (
            activity.map((event) => (
              <div
                className="grid gap-1.5 px-3 py-2.5 text-sm md:grid-cols-[0.7fr_1fr_1fr_1fr_0.7fr] md:items-center md:gap-0 md:py-2"
                key={event.id}
              >
                <div className="flex items-center justify-between gap-3 md:block">
                  <span
                    className={cn(
                      "font-medium",
                      event.type === "Supply"
                        ? "text-outcome-up"
                        : "text-outcome-down"
                    )}
                  >
                    {event.type}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground md:hidden">
                    {formatRelativeTime(event.timestampMs)}
                  </span>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {formatAddress(event.account)}
                </div>
                <LabeledActivityValue
                  label="Amount"
                  value={formatQuoteAmount(event.amount)}
                />
                <LabeledActivityValue
                  label="Shares"
                  value={formatQuoteAmount(event.shares, "PLP")}
                />
                <div className="hidden font-mono text-xs text-muted-foreground md:block md:text-right">
                  {formatRelativeTime(event.timestampMs)}
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No LP activity yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function LabeledActivityValue({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 font-mono text-xs text-foreground tabular-nums md:block md:text-right">
      <span className="text-muted-foreground md:hidden">{label}</span>
      <span>{value}</span>
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
