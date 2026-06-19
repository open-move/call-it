import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { ArrowUpRightIcon } from "lucide-react"
import { useEffect, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

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
import { formatRelativeTime } from "@/lib/format"
import { formatDecimalUnits, parseDecimalUnits } from "@/lib/amounts"
import {
  PREDICT_LP_ASSET,
  PREDICT_QUOTE_ASSET,
  PREDICT_QUOTE_DECIMALS,
  QUOTE_SCALE,
  SUI_NETWORK,
} from "@/lib/config"
import {
  buildSupplyLiquidityTransaction,
  buildWithdrawLiquidityTransaction,
  executeSuiTransaction,
} from "@/services/predict-transactions"
import { formatPredictTradeError } from "@/services/predict-quotes"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import type {
  LpSupplyEvent,
  LpWithdrawalEvent,
  VaultPerformanceResponse,
  VaultSummary,
} from "@/lib/types/predict"
import { getSuiGrpcClient } from "@/services/sui-client"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { cn } from "@/lib/utils"

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
      transactionDigest: string
      type: "Supply"
    }
  | {
      account: string
      amount: number
      id: string
      shares: number
      timestampMs: number
      transactionDigest: string
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
  return value / QUOTE_SCALE
}

function formatTokenAmount(
  value: number,
  symbol: string,
  maximumFractionDigits = 4
) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })} ${symbol}`
}

function formatQuoteAmount(value: number, symbol = "DUSDC") {
  return formatTokenAmount(toQuoteUsd(value), symbol)
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
    transactionDigest: event.digest,
    type: "Supply" as const,
  }))
  const withdrawalActivity = withdrawals.map((event) => ({
    account: event.withdrawer,
    amount: event.amount,
    id: event.event_digest,
    shares: event.shares_burned,
    timestampMs: event.checkpoint_timestamp_ms,
    transactionDigest: event.digest,
    type: "Withdraw" as const,
  }))

  return [...supplyActivity, ...withdrawalActivity]
    .sort((first, second) => second.timestampMs - first.timestampMs)
}

function getAccountUrl(account: string) {
  return `https://suiscan.xyz/${SUI_NETWORK}/account/${account}`
}

function getTransactionUrl(transactionDigest: string) {
  return `https://suiscan.xyz/${SUI_NETWORK}/tx/${transactionDigest}`
}

function getMedian(values: number[]) {
  const sortedValues = [...values].sort((first, second) => first - second)
  const midpoint = Math.floor(sortedValues.length / 2)

  return sortedValues.length % 2 === 0
    ? (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2
    : sortedValues[midpoint]
}

function getDisplayChartPoints(points: VaultPerformanceResponse["points"]) {
  if (points.length < 8) {
    return { filteredCount: 0, points }
  }

  const median = getMedian(points.map((point) => point.share_price))
  const lowerBound = median * 0.9
  const upperBound = median * 1.1
  const displayPoints = points.filter(
    (point) =>
      point.share_price >= lowerBound && point.share_price <= upperBound
  )

  if (displayPoints.length < Math.max(5, points.length * 0.5)) {
    return { filteredCount: 0, points }
  }

  return {
    filteredCount: points.length - displayPoints.length,
    points: displayPoints,
  }
}

function getChartDomain(points: VaultPerformanceResponse["points"]) {
  if (points.length === 0) {
    return undefined
  }

  const values = points.map((point) => point.share_price)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.08, 0.00005)

  return [min - padding, max + padding] satisfies [number, number]
}

export function Page({
  performance,
  supplies,
  summary,
  withdrawals,
}: PageProps) {
  const activity = getActivity(supplies, withdrawals)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="mx-auto grid max-w-5xl items-stretch gap-3 lg:grid-cols-2">
          <VaultStatsCard
            performance={performance}
            summary={summary}
          />

          <aside className="min-w-0">
            <LiquidityPanel summary={summary} />
          </aside>
        </div>

        <div className="mx-auto max-w-5xl">
          <ActivityCard activity={activity} />
        </div>
      </section>
    </main>
  )
}

function VaultStatsCard({
  performance,
  summary,
}: {
  performance: VaultPerformanceResponse
  summary: VaultSummary
}) {
  return (
    <Card className="h-full gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Vault Overview
        </CardTitle>
        <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
          Deposit DUSDC to mint PLP shares that back Predict market liquidity.
          Withdrawals redeem PLP against available vault liquidity.
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-4 pt-2 pb-4">
        <div className="space-y-2.5">
          <VaultStatRow
            label="Vault NAV"
            value={formatQuoteAmount(summary.vault_value)}
          />
          <VaultStatRow
            label="Withdrawable"
            value={formatQuoteAmount(summary.available_withdrawal)}
          />
          <VaultStatRow
            label="Utilization"
            value={formatPercent(summary.utilization)}
          />
          <VaultStatRow
            label="PLP Supply"
            value={formatQuoteAmount(summary.plp_total_supply, "PLP")}
          />
          <VaultStatRow
            label="PLP Price"
            value={`${formatSharePrice(summary.plp_share_price)} DUSDC`}
          />
        </div>

        <VaultPriceChart performance={performance} summary={summary} />
      </CardContent>
    </Card>
  )
}

function VaultStatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs leading-none text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-right font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}

function VaultPriceChart({
  performance,
  summary,
}: {
  performance: VaultPerformanceResponse
  summary: VaultSummary
}) {
  const chartData = getDisplayChartPoints(performance.points)
  const yDomain = getChartDomain(chartData.points)

  return (
    <div className="mt-5 border-t border-border/35 pt-4">
      <div className="h-44 sm:h-48">
        {chartData.points.length > 0 && yDomain ? (
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart
              data={chartData.points}
              margin={{ bottom: 0, left: 0, right: 10, top: 8 }}
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
                    stopColor="var(--primary)"
                    stopOpacity={0.24}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--primary)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                strokeOpacity={0.7}
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
                width={52}
              />
              <Area
                dataKey="share_price"
                fill="url(#plpShareGradient)"
                isAnimationActive={false}
                stroke="var(--primary)"
                strokeWidth={2.25}
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
      buttonLabel={action === "supply" ? "Deposit DUSDC" : "Withdraw PLP"}
      estimatedOutput={estimatedOutput}
      message="Connect wallet to view balances."
      messageTone="muted"
      onActionChange={setAction}
      onAmountChange={setAmount}
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
  const refreshRoute = useAppRouteRefresh()
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
        ? "Deposit DUSDC"
        : "Withdraw PLP"

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
      refreshRoute()
      window.setTimeout(refreshRoute, 1_500)
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
  const plpValueLabel = balances ? formatTokenAmount(plpValue, "DUSDC") : "--"
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
              <div className="text-xs font-medium text-muted-foreground">
                PLP value
              </div>
              <div className="mt-1 font-mono text-xl leading-tight font-medium tracking-tight text-foreground tabular-nums">
                {plpValueLabel}
              </div>
            </div>
            <div className="space-y-2 rounded-md border border-border/35 bg-muted/25 p-2.5">
              <PanelRow label="DUSDC balance" value={dusdcBalanceValue} />
              <PanelRow label="PLP balance" value={plpBalanceValue} />
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
      <Card className="h-full gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0 xl:row-span-2">
        <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
          <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
            Your Liquidity
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3 px-4 pt-2 pb-4">
          {walletAddress ? (
            walletBlock
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm">
              <p className="text-center text-xs text-muted-foreground">
                Connect wallet to view your liquidity.
              </p>
              <Button
                className="w-full"
                disabled={buttonDisabled}
                onClick={onSubmit}
                type="button"
              >
                Sign in to manage liquidity
              </Button>
            </div>
          )}

          {walletAddress && (
            <div className="mt-auto">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="active:scale-[0.98]"
                  onClick={() => selectAction("supply")}
                  type="button"
                >
                  Deposit DUSDC
                </Button>
                <Button
                  className="active:scale-[0.98]"
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
      <DialogContent className="gap-5 rounded-md border-0 bg-card p-5 shadow-none ring-0 sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
            {action === "supply" ? "Deposit DUSDC" : "Withdraw PLP"}
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
              <span>{action === "supply" ? "DUSDC" : "PLP"}</span>
            </div>
          </div>
        </label>

        <div className="space-y-2.5 rounded-md border border-border/35 bg-muted/25 px-3 py-3">
          {actionBalanceLabel && actionBalanceValue && (
            <PanelRow label={actionBalanceLabel} value={actionBalanceValue} />
          )}
          <PanelRow
            label="Est. receive"
            value={
              estimatedOutput === undefined
                ? "--"
                : formatTokenAmount(
                    estimatedOutput,
                    action === "supply" ? "PLP" : "DUSDC",
                    6
                  )
            }
          />
          <PanelRow
            label="PLP price"
            value={`${formatSharePrice(summary.plp_share_price)} DUSDC`}
          />
          {action === "withdraw" && (
            <PanelRow
              label="Vault withdrawable"
              value={formatQuoteAmount(summary.available_withdrawal)}
            />
          )}
        </div>

        {message && (
          <p
            className={cn(
              "rounded-md px-3 py-2 text-xs leading-5",
              messageTone === "error"
                ? "border border-destructive/25 bg-destructive/10 text-destructive"
                : "bg-muted/15 text-muted-foreground"
            )}
          >
            {message}
          </p>
        )}

        {!message && invalidReason && (
          <p className="rounded-md bg-muted/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {invalidReason}
          </p>
        )}

        <DialogFooter>
          <Button
            className="w-full active:scale-[0.98]"
            disabled={buttonDisabled}
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

function ActivityCard({ activity }: { activity: LpActivity[] }) {
  const pageSize = 10
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(activity.length / pageSize))
  const pageStart = page * pageSize
  const visibleActivity = activity.slice(pageStart, pageStart + pageSize)

  useEffect(() => {
    setPage(0)
  }, [activity.length])

  return (
    <Card className="gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Vault Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <div className="hidden border-b border-border/40 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[0.9fr_0.65fr_0.9fr_1fr_1fr_0.7fr]">
          <div>Tx</div>
          <div>Type</div>
          <div>Account</div>
          <div className="text-right">DUSDC</div>
          <div className="text-right">PLP</div>
          <div className="text-right">Time</div>
        </div>
        <div className="divide-y divide-border/25">
          {activity.length > 0 ? (
            visibleActivity.map((event) => (
              <div
                className="grid gap-1.5 px-3 py-2 text-xs md:grid-cols-[0.9fr_0.65fr_0.9fr_1fr_1fr_0.7fr] md:items-center md:gap-0"
                key={event.id}
              >
                <LabeledActivityLink
                  align="left"
                  href={getTransactionUrl(event.transactionDigest)}
                  label="Tx"
                  value={formatAddress(event.transactionDigest)}
                />
                <div className="flex items-center justify-between gap-3 md:block">
                  <span
                    className={cn(
                      "inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium",
                      event.type === "Supply"
                        ? "bg-outcome-up/10 text-outcome-up"
                        : "bg-outcome-down/10 text-outcome-down"
                    )}
                  >
                    {event.type}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground md:hidden">
                    {formatRelativeTime(event.timestampMs)}
                  </span>
                </div>
                <LabeledActivityLink
                  align="left"
                  href={getAccountUrl(event.account)}
                  label="Account"
                  value={formatAddress(event.account)}
                />
                <LabeledActivityValue
                  label="DUSDC"
                  value={formatQuoteAmount(event.amount)}
                />
                <LabeledActivityValue
                  label="PLP"
                  value={formatQuoteAmount(event.shares, "PLP")}
                />
                <div className="hidden font-mono text-xs text-muted-foreground md:block md:text-right">
                  {formatRelativeTime(event.timestampMs)}
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No vault activity yet.
            </div>
          )}
        </div>
        {activity.length > pageSize && (
          <div className="flex items-center justify-between border-t border-border/40 px-3 py-2">
            <Button
              disabled={page === 0}
              onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
              size="xs"
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
              Page {page + 1} / {pageCount}
            </div>
            <Button
              disabled={page >= pageCount - 1}
              onClick={() =>
                setPage((currentPage) => Math.min(pageCount - 1, currentPage + 1))
              }
              size="xs"
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </div>
        )}
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

function LabeledActivityLink({
  align = "right",
  href,
  label,
  value,
}: {
  align?: "left" | "right"
  href: string
  label: string
  value: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 font-mono text-xs tabular-nums md:block",
        align === "right" ? "md:text-right" : "md:text-left"
      )}
    >
      <span className="text-muted-foreground md:hidden">{label}</span>
      <a
        className="inline-flex min-w-0 items-center gap-1 text-muted-foreground transition-[color,transform] duration-150 hover:text-foreground active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        <span className="truncate">{value}</span>
        <ArrowUpRightIcon className="size-3 shrink-0" />
      </a>
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
