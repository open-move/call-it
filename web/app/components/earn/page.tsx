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
import { Input } from "~/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  formatCompactUsd,
  formatRelativeTime,
  formatUsd,
} from "~/lib/callit/format"
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

function isEarnAction(value: unknown): value is EarnAction {
  return value === "supply" || value === "withdraw"
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
    <main className="mx-auto w-full max-w-[96rem] px-4 py-4 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <Hero summary={summary} />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Vault Value"
            value={formatQuoteUsd(summary.vault_value)}
          />
          <MetricCard
            label="PLP Price"
            value={formatSharePrice(summary.plp_share_price)}
          />
          <MetricCard
            label="Available"
            value={formatQuoteUsd(summary.available_withdrawal)}
          />
          <MetricCard
            label="Utilization"
            value={formatPercent(summary.utilization)}
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <PerformanceCard
            performance={performance}
            performanceReturn={performanceReturn}
          />
          <LiquidityPanel summary={summary} />
          <VaultHealthCard summary={summary} />
          <PositionCard summary={summary} />
        </div>

        <ActivityCard activity={activity} />
      </div>
    </main>
  )
}

function Hero({ summary }: { summary: VaultSummary }) {
  return (
    <Card className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="relative px-4 py-5 sm:px-5">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,var(--muted)_0,transparent_55%)] opacity-70" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
              One pooled Predict vault
            </p>
            <h1 className="mt-3 text-2xl leading-tight font-semibold tracking-tight text-foreground sm:text-3xl">
              Earn with the Predict Liquidity Pool
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Supply DUSDC to back prediction markets and receive PLP shares.
              Withdrawals depend on available liquidity and current vault risk.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right sm:flex sm:items-center sm:gap-5">
            <HeroStat
              label="Net deposits"
              value={formatQuoteUsd(summary.net_deposits)}
            />
            <HeroStat
              label="Max payout util"
              value={formatPercent(summary.max_payout_utilization)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2 sm:bg-transparent sm:p-0">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="px-4 py-4">
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {label}
        </div>
        <div className="mt-3 truncate font-mono text-xl font-medium text-foreground tabular-nums">
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

function PerformanceCard({
  performance,
  performanceReturn,
}: {
  performance: VaultPerformanceResponse
  performanceReturn: number
}) {
  const yDomain = getChartDomain(performance.points)
  const latestPoint = performance.points.at(-1)

  return (
    <Card className="min-h-[25rem] rounded-md border-0 bg-card py-0 shadow-none ring-0 xl:col-span-1">
      <CardHeader className="px-4 pt-4 pb-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">PLP Share Price</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Historical vault share value from indexed Predict data.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              All time
            </div>
            <div
              className={cn(
                "mt-1 font-mono text-sm font-medium tabular-nums",
                performanceReturn >= 0 ? "text-outcome-up" : "text-outcome-down"
              )}
            >
              {formatPercent(performanceReturn)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pt-4 pb-4">
        <div className="h-72 px-1">
          {performance.points.length > 0 && yDomain ? (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart
                data={performance.points}
                margin={{ bottom: 0, left: 4, right: 16, top: 12 }}
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
                  minTickGap={34}
                  scale="time"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickFormatter={(value) =>
                    dateFormatter.format(new Date(value))
                  }
                  tickLine={false}
                  type="number"
                />
                <YAxis
                  axisLine={false}
                  domain={yDomain}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickFormatter={(value) => Number(value).toFixed(4)}
                  tickLine={false}
                  width={62}
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
        <div className="grid grid-cols-2 gap-2 px-4 pt-2 sm:grid-cols-4">
          <MiniStat
            label="Current"
            value={
              latestPoint ? formatSharePrice(latestPoint.share_price) : "--"
            }
          />
          <MiniStat
            label="Vault"
            value={
              latestPoint
                ? formatCompactUsd(toQuoteUsd(latestPoint.vault_value))
                : "--"
            }
          />
          <MiniStat
            label="Samples"
            value={performance.points.length.toString()}
          />
          <MiniStat label="Range" value={performance.range} />
        </div>
      </CardContent>
    </Card>
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
      onSubmit={() => undefined}
      summary={summary}
      walletBlock={
        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          Connect wallet to view balances.
        </div>
      }
    />
  )
}

function LiquidityPanelClient({ summary }: { summary: VaultSummary }) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const revalidator = useRevalidator()
  const [action, setAction] = useState<EarnAction>("supply")
  const [amount, setAmount] = useState("")
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
        ? "Supplying"
        : "Withdrawing"
      : action === "supply"
        ? "Supply DUSDC"
        : "Withdraw DUSDC"

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
      setErrorMessage("Supply amount exceeds DUSDC balance")
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
        setErrorMessage("Withdraw amount exceeds available vault liquidity")
        return
      }
    }

    setIsSubmitting(true)
    setErrorMessage(undefined)

    try {
      setStatusMessage(
        action === "supply" ? "Preparing supply" : "Preparing withdrawal"
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
        action === "supply" ? "Supplying DUSDC" : "Withdrawing DUSDC"
      )
      await executeSuiTransaction(signer, transaction)
      setStatusMessage(
        action === "supply" ? "Supply confirmed" : "Withdrawal confirmed"
      )
      setAmount("")
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

  const plpBalance = balances?.plp ?? 0n
  const plpValue =
    (Number(plpBalance) / 10 ** PREDICT_QUOTE_DECIMALS) *
    summary.plp_share_price

  return (
    <LiquidityPanelFrame
      action={action}
      amount={amount}
      buttonDisabled={buttonDisabled}
      buttonLabel={buttonLabel}
      estimatedOutput={estimatedOutput}
      message={errorMessage ?? statusMessage}
      messageTone={errorMessage ? "error" : "muted"}
      onActionChange={setAction}
      onAmountChange={setAmount}
      onSubmit={handleSubmit}
      summary={summary}
      walletBlock={
        walletAddress ? (
          <div className="space-y-2 rounded-md bg-muted p-3">
            <PanelRow
              label="DUSDC balance"
              value={`${formatDecimalUnits(balances?.dusdc ?? 0n, PREDICT_QUOTE_DECIMALS)} DUSDC`}
            />
            <PanelRow
              label="PLP balance"
              value={`${formatDecimalUnits(plpBalance, PREDICT_QUOTE_DECIMALS)} PLP`}
            />
            <PanelRow label="PLP value" value={formatUsd(plpValue)} />
          </div>
        ) : (
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="text-muted-foreground">
              Connect wallet to view balances.
            </p>
            <Button
              className="mt-3 h-9 w-full"
              onClick={() => setShowAuthFlow(true)}
              type="button"
            >
              Sign in
            </Button>
          </div>
        )
      }
    />
  )
}

function LiquidityPanelFrame({
  action,
  amount,
  buttonDisabled,
  buttonLabel,
  estimatedOutput,
  message,
  messageTone,
  onActionChange,
  onAmountChange,
  onSubmit,
  summary,
  walletBlock,
}: {
  action: EarnAction
  amount: string
  buttonDisabled: boolean
  buttonLabel: string
  estimatedOutput?: number
  message?: string
  messageTone: "error" | "muted"
  onActionChange: (action: EarnAction) => void
  onAmountChange: (amount: string) => void
  onSubmit: () => void
  summary: VaultSummary
  walletBlock: React.ReactNode
}) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0 xl:row-span-2">
      <CardContent className="flex h-full flex-col gap-4 px-4 py-4">
        <Tabs
          className="gap-0"
          onValueChange={(value) => {
            if (isEarnAction(value)) {
              onActionChange(value)
            }
          }}
          value={action}
        >
          <TabsList className="h-9 w-full overflow-hidden rounded-md bg-muted p-0">
            {(["supply", "withdraw"] satisfies EarnAction[]).map((item) => (
              <TabsTrigger
                className="!h-full rounded-none border-0 !border-transparent text-sm font-semibold capitalize shadow-none ring-0 outline-none after:hidden focus-visible:!border-transparent focus-visible:!ring-0 focus-visible:!outline-none data-active:!border-transparent data-active:!bg-primary/10 data-active:!text-primary dark:data-active:!border-transparent"
                key={item}
                value={item}
              >
                {item}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <label className="block space-y-2">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Amount
          </span>
          <div className="relative">
            <Input
              className="h-11 border-0 pr-20 font-mono shadow-none ring-0 focus-visible:ring-1"
              inputMode="decimal"
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="0.00"
              value={amount}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
              {action === "supply" ? "DUSDC" : "PLP"}
            </span>
          </div>
        </label>

        {walletBlock}

        <div className="space-y-2 rounded-md bg-muted p-3">
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
          <PanelRow
            label="Available"
            value={formatQuoteUsd(summary.available_withdrawal)}
          />
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          PLP is a proportional claim on vault value. Withdrawals can be limited
          by vault risk and available liquidity.
        </p>

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

        <Button
          className="mt-auto h-11 w-full"
          disabled={buttonDisabled}
          onClick={onSubmit}
          type="button"
        >
          {buttonLabel}
        </Button>
      </CardContent>
    </Card>
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

function VaultHealthCard({ summary }: { summary: VaultSummary }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-0">
        <CardTitle className="text-base">Vault Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-4">
        <PanelRow
          label="Vault balance"
          value={formatQuoteUsd(summary.vault_balance)}
        />
        <PanelRow
          label="Vault value"
          value={formatQuoteUsd(summary.vault_value)}
        />
        <PanelRow label="Total MTM" value={formatQuoteUsd(summary.total_mtm)} />
        <PanelRow
          label="Max payout"
          value={formatQuoteUsd(summary.total_max_payout)}
        />
        <PanelRow
          label="Available liquidity"
          value={formatQuoteUsd(summary.available_liquidity)}
        />
        <PanelRow
          label="Max payout util"
          value={formatPercent(summary.max_payout_utilization)}
        />
      </CardContent>
    </Card>
  )
}

function PositionCard({ summary }: { summary: VaultSummary }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-0">
        <CardTitle className="text-base">Pool Accounting</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-4">
        <PanelRow
          label="PLP supply"
          value={formatQuoteAmount(summary.plp_total_supply, "PLP")}
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
        <p className="pt-2 text-xs leading-5 text-muted-foreground">
          The vault takes the opposite side of Predict trades. PLP holders share
          vault value after current mark-to-market liabilities.
        </p>
      </CardContent>
    </Card>
  )
}

function ActivityCard({ activity }: { activity: LpActivity[] }) {
  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-0">
        <CardTitle className="text-base">Recent LP Activity</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-3">
        <div className="hidden px-4 pb-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[0.7fr_1fr_1fr_1fr_0.7fr]">
          <div>Type</div>
          <div>Account</div>
          <div className="text-right">Amount</div>
          <div className="text-right">Shares</div>
          <div className="text-right">Time</div>
        </div>
        <div className="divide-y divide-border/25">
          {activity.map((event) => (
            <div
              className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[0.7fr_1fr_1fr_1fr_0.7fr] md:items-center md:gap-0 md:py-2.5"
              key={event.id}
            >
              <div
                className={cn(
                  "font-medium",
                  event.type === "Supply"
                    ? "text-outcome-up"
                    : "text-outcome-down"
                )}
              >
                {event.type}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {formatAddress(event.account)}
              </div>
              <div className="font-mono text-xs text-foreground tabular-nums md:text-right">
                {formatQuoteAmount(event.amount)}
              </div>
              <div className="font-mono text-xs text-foreground tabular-nums md:text-right">
                {formatQuoteAmount(event.shares, "PLP")}
              </div>
              <div className="font-mono text-xs text-muted-foreground md:text-right">
                {formatRelativeTime(event.timestampMs)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-xs font-medium text-foreground tabular-nums">
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
