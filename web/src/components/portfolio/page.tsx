import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { formatAddress } from "@mysten/sui/utils"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon, SearchIcon, WalletIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDecimalUnits, parseDecimalUnits } from "@/lib/amounts"
import {
  PREDICT_QUOTE_DECIMALS,
  PREDICT_QUOTE_ASSET,
  PREDICT_PRICE_SCALE as PRICE_SCALE,
  QUOTE_SCALE,
} from "@/lib/config"
import { formatRelativeTime, formatUsd } from "@/lib/format"
import {
  getRangePositionStatus,
  getSettledRangeMarkValue,
} from "@/lib/trade-activity"
import { getPositionSummariesFromActivity } from "@/lib/trade-positions"
import type {
  DirectionalPositionMintEvent,
  DirectionalPositionRedeemEvent,
  ManagerPositionSummary,
  ManagerRangeActivityResponse,
  ManagerSummary,
  OracleInfo,
  RangeMintEvent,
  RangeRedeemEvent,
  VaultSummary,
} from "@/lib/types/predict"
import {
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
  getManagerPositions,
  getManagerPositionSummaries,
  getManagerRanges,
} from "@/services/predict-client"
import {
  buildManagerDepositTransaction,
  buildManagerWithdrawTransaction,
  buildPredictRedeemTransaction,
  executeSuiTransaction,
  simulatePredictRedeemTransaction,
} from "@/services/predict-transactions"
import type { PredictRedeemParams } from "@/services/predict-transactions"
import { formatPredictLifecycleError } from "@/services/predict-quotes"
import { getShieldPositions } from "@/services/shield-client"
import type { ShieldPositionRow } from "@/services/shield-client"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { usePredictAccount } from "@/lib/providers/predict-account"
import { cn } from "@/lib/utils"

export interface PageProps {
  oracles: OracleInfo[]
  vaultSummary: VaultSummary
}

type PortfolioTab = "open" | "redeemable" | "closed" | "activity"
type PositionType = "UP" | "DOWN" | "RNG"
type ChartMode = "realized" | "exposure"
type ChartInterval = "1d" | "1w" | "1m" | "max"
type MarketSide = "up" | "down"

interface MarketManageSearch {
  higherStrike?: number
  lowerStrike?: number
  side?: MarketSide
  strike: number
}
type TradingAccountModalMode = "deposit" | "withdraw"

interface PortfolioPosition {
  assetSymbol: string
  averageEntryPrice: number | null
  contractLabel: string
  costBasisUsd: number
  currentValueUsd: number | null
  expiryMs: number
  id: string
  lastActivityAt: number
  manageSearch: MarketManageSearch
  markPrice: number | null
  oracleId: string
  realizedPnlUsd: number
  reservationLabel?: string
  size: number
  status: string
  type: PositionType
  unrealizedPnlUsd: number | null
}

interface PortfolioState {
  dusdcBalance: bigint
  errorMessage?: string
  isLoading: boolean
  managerId?: string
  managerSummary?: ManagerSummary
  plpBalance: bigint
  positions: PortfolioPosition[]
  realizedPnlPoints: RealizedPnlPoint[]
}

interface PortfolioSummary {
  availableDusdc: number
  openCostBasisUsd: number
  openPredictionValueUsd: number
  plpBalance: number
  plpValueUsd: number
  portfolioValueUsd: number
  rangeCostBasisUsd: number
  realizedPnlUsd: number
  unrealizedPnlUsd: number
  upCostBasisUsd: number
  downCostBasisUsd: number
}

interface RangeAccumulator {
  expiry: number
  higherStrike: number
  lastActivityAt: number
  lowerStrike: number
  mintedQuantity: number
  oracleId: string
  redeemedQuantity: number
  totalCost: number
  totalPayout: number
}

interface RealizedPnlEvent {
  contractLabel: string
  id: string
  pnlUsd: number
  timestampMs: number
}

interface RealizedPnlPoint extends RealizedPnlEvent {
  cumulativePnlUsd: number
}

interface RedeemState {
  errorMessage?: string
  positionId?: string
}

const REALIZED_ACTIVITY_LIMIT = 2_000

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
})

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
})

const axisTick = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
} as const

const portfolioTabs = [
  { label: "Open", value: "open" },
  { label: "Redeemable", value: "redeemable" },
  { label: "Closed", value: "closed" },
  { label: "Activity", value: "activity" },
] satisfies Array<{ label: string; value: PortfolioTab }>

const chartIntervals = [
  { label: "1d", value: "1d" },
  { label: "1w", value: "1w" },
  { label: "1m", value: "1m" },
  { label: "Max", value: "max" },
] satisfies Array<{ label: string; value: ChartInterval }>

function toUsdPrice(value: number) {
  return value / PRICE_SCALE
}

function toQuoteAmount(value: number) {
  return value / QUOTE_SCALE
}

function coinBalanceToAmount(value: bigint) {
  return Number(value) / QUOTE_SCALE
}

function getManagerDusdcBalance(summary: ManagerSummary | undefined) {
  return BigInt(
    Math.floor(
      summary?.balances.find(
        (balance) => balance.quote_asset === PREDICT_QUOTE_ASSET
      )?.balance ?? 0
    )
  )
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 })
}

function formatCents(value: number | null) {
  return value === null ? "--" : `${(value * 100).toFixed(1)}c`
}

function formatDusdcNumber(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })
}

function formatDusdc(value: number, maximumFractionDigits = 2) {
  return `${formatDusdcNumber(value, maximumFractionDigits)} DUSDC`
}

function formatSignedDusdc(value: number, maximumFractionDigits = 2) {
  if (value > 0) {
    return `+${formatDusdc(value, maximumFractionDigits)}`
  }

  if (value < 0) {
    return `-${formatDusdc(Math.abs(value), maximumFractionDigits)}`
  }

  return formatDusdc(0, maximumFractionDigits)
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value)
}

function DusdcValue({
  className,
  maximumFractionDigits = 2,
  unitClassName,
  value,
}: {
  className?: string
  maximumFractionDigits?: number
  unitClassName?: string
  value: number
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="font-mono tabular-nums">
        {formatDusdcNumber(value, maximumFractionDigits)}
      </span>
      <span
        className={cn(
          "text-[0.62em] font-medium tracking-normal text-current opacity-70",
          unitClassName
        )}
      >
        DUSDC
      </span>
    </span>
  )
}

function SignedDusdcValue({
  className,
  maximumFractionDigits = 2,
  unitClassName,
  value,
}: {
  className?: string
  maximumFractionDigits?: number
  unitClassName?: string
  value: number
}) {
  const absoluteValue = Math.abs(value)
  const prefix = value > 0 ? "+" : value < 0 ? "-" : ""

  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="font-mono tabular-nums">
        {prefix}
        {formatDusdcNumber(absoluteValue, maximumFractionDigits)}
      </span>
      <span
        className={cn(
          "text-[0.62em] font-medium tracking-normal text-current opacity-70",
          unitClassName
        )}
      >
        DUSDC
      </span>
    </span>
  )
}

function formatExpiryDistance(expiryMs: number, nowMs = Date.now()) {
  const remainingMs = expiryMs - nowMs

  if (remainingMs <= 0) {
    return "Expired"
  }

  const minutes = Math.round(remainingMs / 60_000)

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.round(minutes / 60)

  if (hours < 48) {
    return `${hours}h`
  }

  return `${Math.round(hours / 24)}d`
}

function getOracleById(oracles: OracleInfo[]) {
  return new Map(oracles.map((oracle) => [oracle.oracle_id, oracle]))
}

function getAssetSymbol(oracleById: Map<string, OracleInfo>, oracleId: string) {
  return oracleById.get(oracleId)?.underlying_asset ?? "Market"
}

function getPositionTypeClassName(type: PositionType) {
  if (type === "UP") {
    return "text-outcome-up"
  }

  if (type === "DOWN") {
    return "text-outcome-down"
  }

  return "text-primary"
}

function getPnlClassName(value: number | null) {
  if (value === null || value === 0) {
    return "text-muted-foreground"
  }

  return value > 0 ? "text-outcome-up" : "text-outcome-down"
}

function getDirectionalPositions(
  summaries: ManagerPositionSummary[],
  oracleById: Map<string, OracleInfo>,
  shieldPositions: ShieldPositionRow[]
): PortfolioPosition[] {
  return summaries
    .filter((summary) => summary.open_quantity > 0)
    .map((summary) => {
      const assetSymbol = getAssetSymbol(oracleById, summary.oracle_id)
      const shieldReservation = findShieldReservation(summary, shieldPositions)
      const strikePriceUsd = toUsdPrice(summary.strike)
      const side: MarketSide = summary.is_up ? "up" : "down"
      const type = summary.is_up ? "UP" : "DOWN"

      return {
        assetSymbol,
        averageEntryPrice:
          summary.average_entry_price === null
            ? null
            : toUsdPrice(summary.average_entry_price),
        contractLabel: `${assetSymbol} ${formatUsd(strikePriceUsd, 0)} ${type}`,
        costBasisUsd: toQuoteAmount(summary.open_cost_basis),
        currentValueUsd:
          summary.mark_value === null
            ? null
            : toQuoteAmount(summary.mark_value),
        expiryMs: summary.expiry,
        id: `${summary.manager_id}:${summary.oracle_id}:${summary.strike}:${side}`,
        lastActivityAt: summary.last_activity_at,
        manageSearch: { side, strike: strikePriceUsd },
        markPrice:
          summary.mark_price === null ? null : toUsdPrice(summary.mark_price),
        oracleId: summary.oracle_id,
        realizedPnlUsd: toQuoteAmount(summary.realized_pnl),
        reservationLabel: shieldReservation ? "Shield reserved" : undefined,
        size: toQuoteAmount(summary.open_quantity),
        status: summary.status,
        type,
        unrealizedPnlUsd:
          summary.mark_value === null
            ? null
            : toQuoteAmount(summary.unrealized_pnl),
      }
    })
}

function findShieldReservation(
  summary: ManagerPositionSummary,
  shieldPositions: ShieldPositionRow[]
) {
  return shieldPositions.find(
    (position) =>
      position.managerId === summary.manager_id &&
      position.oracleId === summary.oracle_id &&
      position.hedgeExpiryMs === summary.expiry &&
      position.isUp === summary.is_up &&
      position.hedgeStrike === BigInt(Math.trunc(summary.strike))
  )
}

function getRangePositionKey(event: RangeMintEvent | RangeRedeemEvent) {
  return `${event.manager_id}:${event.oracle_id}:${event.expiry}:${event.lower_strike}:${event.higher_strike}`
}

function getRangePositions(
  activity: ManagerRangeActivityResponse,
  oracleById: Map<string, OracleInfo>
): PortfolioPosition[] {
  const positions = new Map<string, RangeAccumulator>()

  function getAccumulator(event: RangeMintEvent | RangeRedeemEvent) {
    const key = getRangePositionKey(event)
    const currentPosition = positions.get(key)

    if (currentPosition) {
      return currentPosition
    }

    const position = {
      expiry: event.expiry,
      higherStrike: event.higher_strike,
      lastActivityAt: event.checkpoint_timestamp_ms,
      lowerStrike: event.lower_strike,
      mintedQuantity: 0,
      oracleId: event.oracle_id,
      redeemedQuantity: 0,
      totalCost: 0,
      totalPayout: 0,
    }

    positions.set(key, position)
    return position
  }

  for (const event of activity.minted) {
    const position = getAccumulator(event)

    position.mintedQuantity += event.quantity
    position.totalCost += event.cost
    position.lastActivityAt = Math.max(
      position.lastActivityAt,
      event.checkpoint_timestamp_ms
    )
  }

  for (const event of activity.redeemed) {
    const position = getAccumulator(event)

    position.redeemedQuantity += event.quantity
    position.totalPayout += event.payout
    position.lastActivityAt = Math.max(
      position.lastActivityAt,
      event.checkpoint_timestamp_ms
    )
  }

  return Array.from(positions.entries())
    .map(([id, position]) => {
      const mintedQuantity = toQuoteAmount(position.mintedQuantity)
      const redeemedQuantity = toQuoteAmount(position.redeemedQuantity)
      const size = Math.max(mintedQuantity - redeemedQuantity, 0)
      const averageEntryPrice =
        mintedQuantity > 0
          ? toQuoteAmount(position.totalCost) / mintedQuantity
          : null
      const redeemedCostBasis =
        averageEntryPrice === null ? 0 : averageEntryPrice * redeemedQuantity
      const lowerStrikePriceUsd = toUsdPrice(position.lowerStrike)
      const higherStrikePriceUsd = toUsdPrice(position.higherStrike)
      const assetSymbol = getAssetSymbol(oracleById, position.oracleId)
      const oracle = oracleById.get(position.oracleId)
      const rawOpenQuantity = Math.max(
        position.mintedQuantity - position.redeemedQuantity,
        0
      )
      const markValue = getSettledRangeMarkValue({
        higherStrike: position.higherStrike,
        lowerStrike: position.lowerStrike,
        openQuantity: rawOpenQuantity,
        oracle,
      })
      const currentValueUsd =
        markValue === null ? null : toQuoteAmount(markValue)
      const markPrice =
        currentValueUsd === null || size <= 0 ? null : currentValueUsd / size
      const costBasisUsd =
        averageEntryPrice === null ? 0 : averageEntryPrice * size

      return {
        assetSymbol,
        averageEntryPrice,
        contractLabel: `${assetSymbol} ${formatUsd(lowerStrikePriceUsd, 0)}-${formatUsd(higherStrikePriceUsd, 0)} Range`,
        costBasisUsd,
        currentValueUsd,
        expiryMs: position.expiry,
        id,
        lastActivityAt: position.lastActivityAt,
        manageSearch: {
          higherStrike: higherStrikePriceUsd,
          lowerStrike: lowerStrikePriceUsd,
          strike: lowerStrikePriceUsd,
        },
        markPrice,
        oracleId: position.oracleId,
        realizedPnlUsd: toQuoteAmount(position.totalPayout) - redeemedCostBasis,
        size,
        status: getRangePositionStatus({
          expiry: position.expiry,
          markValue,
          openQuantity: rawOpenQuantity,
          oracle,
        }),
        type: "RNG" as const,
        unrealizedPnlUsd:
          currentValueUsd === null ? null : currentValueUsd - costBasisUsd,
      }
    })
    .filter((position) => position.size > 0)
}

function getDirectionalActivityKey(
  event: DirectionalPositionMintEvent | DirectionalPositionRedeemEvent
) {
  return `${event.manager_id}:${event.oracle_id}:${event.expiry}:${event.strike}:${event.is_up ? "up" : "down"}`
}

function getRangeActivityKey(event: RangeMintEvent | RangeRedeemEvent) {
  return `${event.manager_id}:${event.oracle_id}:${event.expiry}:${event.lower_strike}:${event.higher_strike}`
}

function sortActivityEvents<
  T extends {
    event: {
      checkpoint_timestamp_ms: number
      event_index: number
      tx_index: number
    }
  },
>(events: T[]) {
  return events.slice().sort((firstEvent, secondEvent) => {
    return (
      firstEvent.event.checkpoint_timestamp_ms -
        secondEvent.event.checkpoint_timestamp_ms ||
      firstEvent.event.tx_index - secondEvent.event.tx_index ||
      firstEvent.event.event_index - secondEvent.event.event_index
    )
  })
}

function getDirectionalRealizedPnlEvents({
  minted,
  oracleById,
  redeemed,
}: {
  minted: DirectionalPositionMintEvent[]
  oracleById: Map<string, OracleInfo>
  redeemed: DirectionalPositionRedeemEvent[]
}): RealizedPnlEvent[] {
  const positions = new Map<string, { cost: number; quantity: number }>()
  const events = sortActivityEvents([
    ...minted.map((event) => ({ event, kind: "mint" as const })),
    ...redeemed.map((event) => ({ event, kind: "redeem" as const })),
  ])
  const realizedEvents: RealizedPnlEvent[] = []

  for (const item of events) {
    const key = getDirectionalActivityKey(item.event)
    const position = positions.get(key) ?? { cost: 0, quantity: 0 }

    if (item.kind === "mint") {
      position.cost += item.event.cost
      position.quantity += item.event.quantity
      positions.set(key, position)
      continue
    }

    const averageEntryCost =
      position.quantity > 0 ? position.cost / position.quantity : 0
    const redeemedCostBasis = averageEntryCost * item.event.quantity
    const assetSymbol = getAssetSymbol(oracleById, item.event.oracle_id)
    const type = item.event.is_up ? "UP" : "DOWN"
    const strikePriceUsd = toUsdPrice(item.event.strike)

    realizedEvents.push({
      contractLabel: `${assetSymbol} ${formatUsd(strikePriceUsd, 0)} ${type}`,
      id: item.event.event_digest,
      pnlUsd: toQuoteAmount(item.event.payout - redeemedCostBasis),
      timestampMs: item.event.checkpoint_timestamp_ms,
    })

    position.quantity = Math.max(position.quantity - item.event.quantity, 0)
    position.cost = Math.max(position.cost - redeemedCostBasis, 0)
    positions.set(key, position)
  }

  return realizedEvents
}

function getRangeRealizedPnlEvents({
  activity,
  oracleById,
}: {
  activity: ManagerRangeActivityResponse
  oracleById: Map<string, OracleInfo>
}): RealizedPnlEvent[] {
  const positions = new Map<string, { cost: number; quantity: number }>()
  const events = sortActivityEvents([
    ...activity.minted.map((event) => ({ event, kind: "mint" as const })),
    ...activity.redeemed.map((event) => ({ event, kind: "redeem" as const })),
  ])
  const realizedEvents: RealizedPnlEvent[] = []

  for (const item of events) {
    const key = getRangeActivityKey(item.event)
    const position = positions.get(key) ?? { cost: 0, quantity: 0 }

    if (item.kind === "mint") {
      position.cost += item.event.cost
      position.quantity += item.event.quantity
      positions.set(key, position)
      continue
    }

    const averageEntryCost =
      position.quantity > 0 ? position.cost / position.quantity : 0
    const redeemedCostBasis = averageEntryCost * item.event.quantity
    const assetSymbol = getAssetSymbol(oracleById, item.event.oracle_id)
    const lowerStrikePriceUsd = toUsdPrice(item.event.lower_strike)
    const higherStrikePriceUsd = toUsdPrice(item.event.higher_strike)

    realizedEvents.push({
      contractLabel: `${assetSymbol} ${formatUsd(lowerStrikePriceUsd, 0)}-${formatUsd(higherStrikePriceUsd, 0)} Range`,
      id: item.event.event_digest,
      pnlUsd: toQuoteAmount(item.event.payout - redeemedCostBasis),
      timestampMs: item.event.checkpoint_timestamp_ms,
    })

    position.quantity = Math.max(position.quantity - item.event.quantity, 0)
    position.cost = Math.max(position.cost - redeemedCostBasis, 0)
    positions.set(key, position)
  }

  return realizedEvents
}

function getRealizedPnlPoints(events: RealizedPnlEvent[]) {
  let cumulativePnlUsd = 0

  return events
    .slice()
    .sort(
      (firstEvent, secondEvent) =>
        firstEvent.timestampMs - secondEvent.timestampMs ||
        firstEvent.id.localeCompare(secondEvent.id)
    )
    .map((event) => {
      cumulativePnlUsd += event.pnlUsd

      return {
        ...event,
        cumulativePnlUsd,
      }
    })
}

function getRealizedPnlChartData({
  directionalMinted,
  directionalRedeemed,
  oracleById,
  rangeActivity,
}: {
  directionalMinted: DirectionalPositionMintEvent[]
  directionalRedeemed: DirectionalPositionRedeemEvent[]
  oracleById: Map<string, OracleInfo>
  rangeActivity: ManagerRangeActivityResponse
}) {
  return getRealizedPnlPoints([
    ...getDirectionalRealizedPnlEvents({
      minted: directionalMinted,
      oracleById,
      redeemed: directionalRedeemed,
    }),
    ...getRangeRealizedPnlEvents({ activity: rangeActivity, oracleById }),
  ])
}

function getPortfolioPositions({
  oracleById,
  rangeActivity,
  shieldPositions,
  summaries,
}: {
  oracleById: Map<string, OracleInfo>
  rangeActivity: ManagerRangeActivityResponse
  shieldPositions: ShieldPositionRow[]
  summaries: ManagerPositionSummary[]
}) {
  return [
    ...getDirectionalPositions(summaries, oracleById, shieldPositions),
    ...getRangePositions(rangeActivity, oracleById),
  ].sort(
    (firstPosition, secondPosition) =>
      secondPosition.lastActivityAt - firstPosition.lastActivityAt ||
      firstPosition.contractLabel.localeCompare(secondPosition.contractLabel)
  )
}

function getPortfolioSummary({
  dusdcBalance,
  plpBalance,
  positions,
  realizedPnlPoints,
  vaultSummary,
}: {
  dusdcBalance: bigint
  plpBalance: bigint
  positions: PortfolioPosition[]
  realizedPnlPoints: RealizedPnlPoint[]
  vaultSummary: VaultSummary
}): PortfolioSummary {
  const availableDusdc = coinBalanceToAmount(dusdcBalance)
  const plpAmount = coinBalanceToAmount(plpBalance)
  const plpValueUsd = plpAmount * vaultSummary.plp_share_price
  const openCostBasisUsd = positions.reduce(
    (total, position) => total + position.costBasisUsd,
    0
  )
  const openPredictionValueUsd = positions.reduce(
    (total, position) => total + (position.currentValueUsd ?? 0),
    0
  )
  const unrealizedPnlUsd = positions.reduce(
    (total, position) => total + (position.unrealizedPnlUsd ?? 0),
    0
  )
  const realizedPnlUsd = realizedPnlPoints.at(-1)?.cumulativePnlUsd ?? 0
  return {
    availableDusdc,
    downCostBasisUsd: positions.reduce(
      (total, position) =>
        total + (position.type === "DOWN" ? position.costBasisUsd : 0),
      0
    ),
    openCostBasisUsd,
    openPredictionValueUsd,
    plpBalance: plpAmount,
    plpValueUsd,
    portfolioValueUsd: availableDusdc + plpValueUsd + openPredictionValueUsd,
    rangeCostBasisUsd: positions.reduce(
      (total, position) =>
        total + (position.type === "RNG" ? position.costBasisUsd : 0),
      0
    ),
    realizedPnlUsd,
    unrealizedPnlUsd,
    upCostBasisUsd: positions.reduce(
      (total, position) =>
        total + (position.type === "UP" ? position.costBasisUsd : 0),
      0
    ),
  }
}

function getFilteredPositions({
  positions,
  searchQuery,
  tab,
}: {
  positions: PortfolioPosition[]
  searchQuery: string
  tab: PortfolioTab
}) {
  const normalizedQuery = searchQuery.trim().toLowerCase()

  return positions.filter((position) => {
    const status = position.status.toLowerCase()
    const isClosedStatus =
      status === "closed" ||
      status === "lost" ||
      status === "liquidated" ||
      status === "redeemed"
    const matchesTab =
      tab === "activity" ||
      (tab === "open" && status !== "redeemable" && !isClosedStatus) ||
      (tab === "redeemable" && status === "redeemable") ||
      (tab === "closed" && isClosedStatus)

    if (!matchesTab) {
      return false
    }

    if (!normalizedQuery) {
      return true
    }

    return [
      position.assetSymbol,
      position.contractLabel,
      position.oracleId,
      position.status,
      position.type,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  })
}

function canRedeemPortfolioPosition(position: PortfolioPosition) {
  if (position.status.toLowerCase() !== "redeemable" || position.size <= 0) {
    return false
  }

  if (position.type === "RNG") {
    return (
      position.manageSearch.lowerStrike !== undefined &&
      position.manageSearch.higherStrike !== undefined
    )
  }

  return position.manageSearch.side !== undefined
}

function toOnchainPositionQuantity(quantity: number) {
  return BigInt(Math.round(quantity * QUOTE_SCALE))
}

function getPortfolioRedeemParams({
  position,
  walletAddress,
}: {
  position: PortfolioPosition
  walletAddress: string
}): PredictRedeemParams | undefined {
  if (!canRedeemPortfolioPosition(position)) {
    return undefined
  }

  const quantity = toOnchainPositionQuantity(position.size)

  if (quantity <= 0n) {
    return undefined
  }

  if (position.type === "RNG") {
    const { higherStrike, lowerStrike } = position.manageSearch

    if (higherStrike === undefined || lowerStrike === undefined) {
      return undefined
    }

    return {
      expiryMs: position.expiryMs,
      higherStrikePriceUsd: higherStrike,
      kind: "range",
      lowerStrikePriceUsd: lowerStrike,
      oracleId: position.oracleId,
      quantity,
      walletAddress,
    }
  }

  const { side } = position.manageSearch

  if (side === undefined) {
    return undefined
  }

  return {
    expiryMs: position.expiryMs,
    isUp: side === "up",
    kind: "binary",
    oracleId: position.oracleId,
    quantity,
    strikePriceUsd: position.manageSearch.strike,
    walletAddress,
  }
}

function getTabCount(positions: PortfolioPosition[], tab: PortfolioTab) {
  return getFilteredPositions({ positions, searchQuery: "", tab }).length
}

export function Page(props: PageProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <ConnectPortfolioCard onConnect={() => undefined} />
      </main>
    )
  }

  return <PageClient {...props} />
}

function PageClient({ oracles, vaultSummary }: PageProps) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const predictAccount = usePredictAccount()
  const refreshRoute = useAppRouteRefresh()
  const [portfolioState, setPortfolioState] = useState<PortfolioState>({
    dusdcBalance: 0n,
    isLoading: false,
    plpBalance: 0n,
    positions: [],
    realizedPnlPoints: [],
  })
  const [activeTab, setActiveTab] = useState<PortfolioTab>("open")
  const [positionRefreshNonce, setPositionRefreshNonce] = useState(0)
  const [redeemState, setRedeemState] = useState<RedeemState>({})
  const [createManagerError, setCreateManagerError] = useState<string>()
  const [depositAmount, setDepositAmount] = useState("")
  const [depositError, setDepositError] = useState<string>()
  const [depositStatusMessage, setDepositStatusMessage] = useState<string>()
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawError, setWithdrawError] = useState<string>()
  const [withdrawStatusMessage, setWithdrawStatusMessage] = useState<string>()
  const [isDepositing, setIsDepositing] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [tradingAccountModalMode, setTradingAccountModalMode] =
    useState<TradingAccountModalMode | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const walletAddress = primaryWallet?.address
  const managerId = predictAccount.managerId
  const managerSummary = predictAccount.managerSummary
  const dusdcBalance = predictAccount.walletDusdcBalance ?? 0n
  const plpBalance = predictAccount.walletPlpBalance ?? 0n
  const selectedDepositAmount = parseDecimalUnits(
    depositAmount,
    PREDICT_QUOTE_DECIMALS
  )
  const selectedWithdrawAmount = parseDecimalUnits(
    withdrawAmount,
    PREDICT_QUOTE_DECIMALS
  )
  const oracleById = getOracleById(oracles)
  const summary = getPortfolioSummary({
    dusdcBalance: portfolioState.dusdcBalance,
    plpBalance: portfolioState.plpBalance,
    positions: portfolioState.positions,
    realizedPnlPoints: portfolioState.realizedPnlPoints,
    vaultSummary,
  })
  const filteredPositions = getFilteredPositions({
    positions: portfolioState.positions,
    searchQuery,
    tab: activeTab,
  })

  useEffect(() => {
    let isStale = false

    async function loadPortfolio() {
      if (!walletAddress) {
        setPortfolioState({
          dusdcBalance: 0n,
          isLoading: false,
          plpBalance: 0n,
          positions: [],
          realizedPnlPoints: [],
        })
        return
      }

      if (predictAccount.status === "loading" && !managerId) {
        setPortfolioState((currentState) => ({
          ...currentState,
          dusdcBalance,
          errorMessage: undefined,
          isLoading: true,
          managerId: undefined,
          managerSummary: undefined,
          plpBalance,
          positions: [],
          realizedPnlPoints: [],
        }))
        return
      }

      setPortfolioState((currentState) => ({
        ...currentState,
        dusdcBalance,
        errorMessage: undefined,
        isLoading: Boolean(managerId),
        managerId,
        managerSummary,
        plpBalance,
      }))
      setCreateManagerError(undefined)
      setDepositError(undefined)
      setWithdrawError(undefined)

      if (!managerId) {
        setPortfolioState((currentState) => ({
          ...currentState,
          dusdcBalance,
          isLoading: false,
          managerId: undefined,
          managerSummary: undefined,
          plpBalance,
          positions: [],
          realizedPnlPoints: [],
        }))
        return
      }

      try {
        const [
          summaryResult,
          rangeActivity,
          directionalMinted,
          directionalRedeemed,
          shieldPositions,
        ] = await Promise.all([
          getManagerPositionSummaries(managerId).catch(() => undefined),
          getManagerRanges(managerId).catch(() => ({
            minted: [],
            redeemed: [],
          })),
          getDirectionalPositionMints(REALIZED_ACTIVITY_LIMIT).catch(() => []),
          getDirectionalPositionRedeems(REALIZED_ACTIVITY_LIMIT).catch(
            () => []
          ),
          getShieldPositions(walletAddress).catch(() => []),
        ])

        const currentOracleById = getOracleById(oracles)
        const summaries =
          summaryResult ??
          getPositionSummariesFromActivity(
            await getManagerPositions(managerId).catch(() => ({
              minted: [],
              redeemed: [],
            })),
            currentOracleById
          )

        if (!isStale) {
          setPortfolioState({
            dusdcBalance,
            isLoading: false,
            managerId,
            managerSummary,
            plpBalance,
            positions: getPortfolioPositions({
              oracleById: currentOracleById,
              rangeActivity,
              shieldPositions,
              summaries,
            }),
            realizedPnlPoints: getRealizedPnlChartData({
              directionalMinted: directionalMinted.filter(
                (event) => event.manager_id === managerId
              ),
              directionalRedeemed: directionalRedeemed.filter(
                (event) => event.manager_id === managerId
              ),
              oracleById: currentOracleById,
              rangeActivity,
            }),
          })
        }
      } catch (error) {
        if (!isStale) {
          setPortfolioState((currentState) => ({
            ...currentState,
            errorMessage:
              error instanceof Error
                ? error.message
                : "Failed to load portfolio.",
            isLoading: false,
          }))
        }
      }
    }

    void loadPortfolio()

    return () => {
      isStale = true
    }
  }, [
    dusdcBalance,
    managerId,
    managerSummary,
    oracles,
    plpBalance,
    positionRefreshNonce,
    predictAccount.status,
    walletAddress,
  ])

  function resetTradingAccountState() {
    setCreateManagerError(undefined)
    setDepositAmount("")
    setDepositError(undefined)
    setDepositStatusMessage(undefined)
    setWithdrawAmount("")
    setWithdrawError(undefined)
    setWithdrawStatusMessage(undefined)
  }

  async function handleCreateTradingAccount() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setCreateManagerError(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    setCreateManagerError(undefined)

    try {
      const createdManagerId = await predictAccount.ensureManager(signer)

      setPortfolioState((currentState) => ({
        ...currentState,
        managerId: createdManagerId,
      }))
      setTradingAccountModalMode("deposit")
      void predictAccount.refreshAccount()
      setPositionRefreshNonce((current) => current + 1)
    } catch (error) {
      setCreateManagerError(
        error instanceof Error
          ? error.message
          : "Failed to initialize portfolio."
      )
    }
  }

  async function handleDepositToTradingAccount() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    if (!managerId) {
      setDepositError(
        predictAccount.status === "loading"
          ? "Preparing portfolio. Try again in a moment."
          : "Initialize portfolio first."
      )
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setDepositError(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    if (!selectedDepositAmount) {
      setDepositError("Enter a positive deposit amount")
      return
    }

    if (selectedDepositAmount > dusdcBalance) {
      setDepositError("Deposit amount exceeds wallet DUSDC balance")
      return
    }

    setIsDepositing(true)
    setDepositError(undefined)
    setDepositStatusMessage("Submitting deposit")

    try {
      const transaction = await buildManagerDepositTransaction({
        amount: selectedDepositAmount,
        managerId,
        walletAddress,
      })

      await executeSuiTransaction(signer, transaction)
      resetTradingAccountState()
      setTradingAccountModalMode(null)
      void predictAccount.refreshAccount()
      setPositionRefreshNonce((current) => current + 1)
    } catch (error) {
      setDepositStatusMessage(undefined)
      setDepositError(
        error instanceof Error ? error.message : "Failed to deposit DUSDC."
      )
    } finally {
      setIsDepositing(false)
    }
  }

  async function handleWithdrawFromTradingAccount() {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    if (!managerId) {
      setWithdrawError(
        predictAccount.status === "loading"
          ? "Preparing portfolio. Try again in a moment."
          : "Initialize portfolio first."
      )
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setWithdrawError(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    if (!selectedWithdrawAmount) {
      setWithdrawError("Enter a positive withdrawal amount")
      return
    }

    const managerBalance = getManagerDusdcBalance(managerSummary)

    if (selectedWithdrawAmount > managerBalance) {
      setWithdrawError("Withdrawal amount exceeds available DUSDC")
      return
    }

    setIsWithdrawing(true)
    setWithdrawError(undefined)
    setWithdrawStatusMessage("Submitting withdrawal")

    try {
      const transaction = buildManagerWithdrawTransaction({
        amount: selectedWithdrawAmount,
        managerId,
        walletAddress,
      })

      await executeSuiTransaction(signer, transaction)
      resetTradingAccountState()
      setTradingAccountModalMode(null)
      void predictAccount.refreshAccount()
      setPositionRefreshNonce((current) => current + 1)
    } catch (error) {
      setWithdrawStatusMessage(undefined)
      setWithdrawError(
        error instanceof Error ? error.message : "Failed to withdraw DUSDC."
      )
    } finally {
      setIsWithdrawing(false)
    }
  }

  async function handleRedeemPosition(position: PortfolioPosition) {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setRedeemState({
        errorMessage: RECONNECT_SUI_WALLET_MESSAGE,
        positionId: position.id,
      })
      setShowAuthFlow(true)
      return
    }

    if (!managerId) {
      setRedeemState({
        errorMessage: "Could not resolve portfolio.",
        positionId: position.id,
      })
      return
    }

    const params = getPortfolioRedeemParams({ position, walletAddress })

    if (!params) {
      setRedeemState({
        errorMessage: "This position is not redeemable yet.",
        positionId: position.id,
      })
      return
    }

    setRedeemState({ positionId: position.id })

    try {
      await simulatePredictRedeemTransaction({
        managerId,
        params,
      })

      await executeSuiTransaction(
        signer,
        buildPredictRedeemTransaction({
          managerId,
          params,
        })
      )

      setRedeemState({})
      void predictAccount.refreshAccount()
      setPositionRefreshNonce((current) => current + 1)
      refreshRoute()
      window.setTimeout(refreshRoute, 1_500)
    } catch (error) {
      setRedeemState({
        errorMessage: formatPredictLifecycleError(error, "Redeem failed."),
        positionId: position.id,
      })
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3">
        {!walletAddress ? (
          <ConnectPortfolioCard onConnect={() => setShowAuthFlow(true)} />
        ) : (
          <>
            <section className="grid gap-3 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
              <AccountCard
                summary={summary}
                deployedDusdc={coinBalanceToAmount(
                  getManagerDusdcBalance(managerSummary)
                )}
                onOpenDeposit={() => {
                  resetTradingAccountState()
                  setTradingAccountModalMode("deposit")
                }}
                onOpenWithdraw={() => {
                  resetTradingAccountState()
                  setTradingAccountModalMode("withdraw")
                }}
              />
              <TradingAccountDialog
                createManagerError={createManagerError}
                depositAmount={depositAmount}
                depositError={depositError}
                depositStatusMessage={depositStatusMessage}
                dusdcBalance={dusdcBalance}
                isCreatingManager={predictAccount.isCreatingManager}
                isDepositing={isDepositing}
                isLoadingAccount={predictAccount.status === "loading"}
                isWithdrawing={isWithdrawing}
                managerId={managerId}
                managerSummary={managerSummary}
                mode={tradingAccountModalMode}
                summary={summary}
                withdrawAmount={withdrawAmount}
                withdrawError={withdrawError}
                withdrawStatusMessage={withdrawStatusMessage}
                walletAddress={walletAddress}
                onCreateManager={handleCreateTradingAccount}
                onDepositAmountChange={setDepositAmount}
                onDepositMax={() =>
                  setDepositAmount(
                    formatDecimalUnits(dusdcBalance, PREDICT_QUOTE_DECIMALS)
                  )
                }
                onDepositSubmit={handleDepositToTradingAccount}
                onOpenChange={(open) => {
                  if (!open) {
                    setTradingAccountModalMode(null)
                    resetTradingAccountState()
                  }
                }}
                onWithdrawAmountChange={setWithdrawAmount}
                onWithdrawMax={() =>
                  setWithdrawAmount(
                    formatDecimalUnits(
                      getManagerDusdcBalance(managerSummary),
                      PREDICT_QUOTE_DECIMALS
                    )
                  )
                }
                onWithdrawSubmit={handleWithdrawFromTradingAccount}
              />

              <PortfolioChartCard
                isLoading={portfolioState.isLoading}
                realizedPnlPoints={portfolioState.realizedPnlPoints}
                summary={summary}
              />
            </section>

            {portfolioState.errorMessage ? (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {portfolioState.errorMessage}
              </div>
            ) : null}
            {redeemState.errorMessage ? (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {redeemState.errorMessage}
              </div>
            ) : null}

            <PositionsLedger
              activeTab={activeTab}
              isLoading={portfolioState.isLoading}
              onRedeemPosition={handleRedeemPosition}
              positions={filteredPositions}
              redeemingPositionId={redeemState.positionId}
              searchQuery={searchQuery}
              totalPositions={portfolioState.positions}
              onSearchChange={setSearchQuery}
              onTabChange={setActiveTab}
            />
          </>
        )}
      </div>
    </main>
  )
}

function ConnectPortfolioCard({ onConnect }: { onConnect: () => void }) {
  return (
    <Card className="flex min-h-96 items-center justify-center rounded-md border-0 bg-card px-4 py-12 text-center shadow-none ring-0">
      <div className="max-w-sm">
        <div className="mx-auto grid size-10 place-items-center rounded-md bg-primary/12 text-primary">
          <WalletIcon className="size-5" />
        </div>
        <h2 className="mt-4 text-base font-medium text-foreground">
          Connect wallet
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          View DUSDC, PLP, and open Predict positions in one compact ledger.
        </p>
        <Button className="mt-5" size="sm" type="button" onClick={onConnect}>
          Connect Wallet
        </Button>
      </div>
    </Card>
  )
}

function AccountCard({
  deployedDusdc,
  summary,
  onOpenDeposit,
  onOpenWithdraw,
}: {
  deployedDusdc: number
  summary: PortfolioSummary
  onOpenDeposit: () => void
  onOpenWithdraw: () => void
}) {
  return (
    <Card className="gap-0 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <div className="border-b border-border/45 px-4 py-3">
        <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Portfolio
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4">
        <div>
          <div className="truncate text-xs text-muted-foreground">
            Net Value
          </div>

          <div>
            <DusdcValue
              className="mt-1 text-2xl font-medium tracking-tight text-foreground"
              value={summary.portfolioValueUsd}
            />

            <div
              className={cn(
                "mt-1 flex items-baseline gap-1.5 text-xs",
                getPnlClassName(summary.unrealizedPnlUsd)
              )}
            >
              <SignedDusdcValue value={summary.unrealizedPnlUsd} />
              <span className="text-muted-foreground">unrealized</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Available DUSDC"
            value={<DusdcValue value={summary.availableDusdc} />}
          />
          <Metric
            label="Deployed DUSDC"
            value={<DusdcValue value={deployedDusdc} />}
          />
          <Metric
            label="PLP Value"
            value={<DusdcValue value={summary.plpValueUsd} />}
          />
          <Metric
            label="Realized PnL"
            tone={
              summary.realizedPnlUsd === 0
                ? "muted"
                : summary.realizedPnlUsd > 0
                  ? "up"
                  : "down"
            }
            value={<SignedDusdcValue value={summary.realizedPnlUsd} />}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            className="h-auto min-h-9 py-2 text-center leading-5 whitespace-normal"
            type="button"
            onClick={onOpenDeposit}
          >
            Deposit
          </Button>
          <Button
            className="h-auto min-h-9 py-2 text-center leading-5 whitespace-normal"
            type="button"
            variant="secondary"
            onClick={onOpenWithdraw}
          >
            Withdraw
          </Button>
        </div>
      </div>
    </Card>
  )
}

function TradingAccountDialog({
  createManagerError,
  depositAmount,
  depositError,
  depositStatusMessage,
  dusdcBalance,
  isCreatingManager,
  isDepositing,
  isLoadingAccount,
  isWithdrawing,
  managerId,
  managerSummary,
  mode,
  summary,
  withdrawAmount,
  withdrawError,
  withdrawStatusMessage,
  walletAddress,
  onCreateManager,
  onDepositAmountChange,
  onDepositMax,
  onDepositSubmit,
  onOpenChange,
  onWithdrawAmountChange,
  onWithdrawMax,
  onWithdrawSubmit,
}: {
  createManagerError?: string
  depositAmount: string
  depositError?: string
  depositStatusMessage?: string
  dusdcBalance: bigint
  isCreatingManager: boolean
  isDepositing: boolean
  isLoadingAccount: boolean
  isWithdrawing: boolean
  managerId?: string
  managerSummary?: ManagerSummary
  mode: TradingAccountModalMode | null
  summary: PortfolioSummary
  withdrawAmount: string
  withdrawError?: string
  withdrawStatusMessage?: string
  walletAddress?: string
  onCreateManager: () => Promise<void>
  onDepositAmountChange: (value: string) => void
  onDepositMax: () => void
  onDepositSubmit: () => Promise<void>
  onOpenChange: (open: boolean) => void
  onWithdrawAmountChange: (value: string) => void
  onWithdrawMax: () => void
  onWithdrawSubmit: () => Promise<void>
}) {
  const isOpen = mode !== null
  const isDepositMode = mode === "deposit"
  const title = isDepositMode ? "Deposit DUSDC" : "Withdraw DUSDC"
  const description = isDepositMode
    ? "Move DUSDC from the connected wallet into your portfolio."
    : "Move available DUSDC back to the connected wallet."

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-0 shadow-none ring-0">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-4">
            <AccountModalRow
              label="Connected wallet"
              value={
                walletAddress ? formatAddress(walletAddress) : "Not connected"
              }
            />
            <AccountModalRow
              label="Portfolio"
              value={managerId ? "Initialized" : "Not initialized"}
            />
          </div>

          {!managerId && isLoadingAccount ? (
            <div className="grid gap-3">
              <div className="rounded-lg border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
                Preparing portfolio...
              </div>
            </div>
          ) : !managerId ? (
            <div className="grid gap-3">
              <div className="rounded-lg border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
                Initialize your portfolio to start moving funds in and out.
              </div>
              {createManagerError ? (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {createManagerError}
                </div>
              ) : null}
            </div>
          ) : isDepositMode ? (
            <div className="grid gap-3">
              <div className="rounded-lg border border-border/60 bg-card/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <label
                    className="text-xs tracking-[0.18em] text-muted-foreground uppercase"
                    htmlFor="deposit-amount"
                  >
                    Deposit Amount
                  </label>
                  <button
                    className="text-xs font-medium text-primary"
                    type="button"
                    onClick={onDepositMax}
                  >
                    MAX
                  </button>
                </div>
                <Input
                  id="deposit-amount"
                  className="mt-2"
                  inputMode="decimal"
                  placeholder="Enter DUSDC amount"
                  value={depositAmount}
                  onChange={(event) =>
                    onDepositAmountChange(event.target.value)
                  }
                />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Available:{" "}
                    {`${formatDecimalUnits(dusdcBalance, PREDICT_QUOTE_DECIMALS, 4)} DUSDC`}
                  </span>
                  <span>PLP value: {formatDusdc(summary.plpValueUsd)}</span>
                </div>
              </div>

              {depositError ? (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {depositError}
                </div>
              ) : null}
              {depositStatusMessage ? (
                <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {depositStatusMessage}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="rounded-lg border border-border/60 bg-card/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <label
                    className="text-xs tracking-[0.18em] text-muted-foreground uppercase"
                    htmlFor="withdraw-amount"
                  >
                    Withdraw Amount
                  </label>
                  <button
                    className="text-xs font-medium text-primary"
                    type="button"
                    onClick={onWithdrawMax}
                  >
                    MAX
                  </button>
                </div>
                <Input
                  id="withdraw-amount"
                  className="mt-2"
                  inputMode="decimal"
                  placeholder="Enter DUSDC amount"
                  value={withdrawAmount}
                  onChange={(event) =>
                    onWithdrawAmountChange(event.target.value)
                  }
                />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Available:{" "}
                    {`${formatDecimalUnits(getManagerDusdcBalance(managerSummary), PREDICT_QUOTE_DECIMALS, 4)} DUSDC`}
                  </span>
                  <span>PLP value: {formatDusdc(summary.plpValueUsd)}</span>
                </div>
              </div>

              {withdrawError ? (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {withdrawError}
                </div>
              ) : null}
              {withdrawStatusMessage ? (
                <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {withdrawStatusMessage}
                </div>
              ) : null}
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
            {managerId
              ? isDepositMode
                ? "Funds move from your wallet into your portfolio."
                : "Funds move from your portfolio back to your wallet."
              : isLoadingAccount
                ? "Checking your connected wallet for portfolio setup."
                : "Initialize portfolio first."}
          </div>
        </div>

        <DialogFooter showCloseButton>
          {!managerId ? (
            <Button
              disabled={isCreatingManager || isLoadingAccount}
              type="button"
              variant="outline"
              onClick={() => {
                void onCreateManager()
              }}
            >
              {isLoadingAccount
                ? "Preparing..."
                : isCreatingManager
                  ? "Initializing..."
                  : "Initialize Portfolio"}
            </Button>
          ) : isDepositMode ? (
            <Button
              disabled={isDepositing}
              type="button"
              variant="outline"
              onClick={() => {
                void onDepositSubmit()
              }}
            >
              {isDepositing ? "Depositing..." : "Confirm Deposit"}
            </Button>
          ) : (
            <Button
              disabled={isWithdrawing}
              type="button"
              variant="outline"
              onClick={() => {
                void onWithdrawSubmit()
              }}
            >
              {isWithdrawing ? "Withdrawing..." : "Confirm Withdrawal"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AccountModalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="font-mono text-sm text-foreground">{value}</span>
    </div>
  )
}

function Metric({
  label,
  tone = "default",
  value,
}: {
  label: string
  tone?: "default" | "muted" | "up" | "down"
  value: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/25 px-2.5 py-2">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-sm font-medium",
          tone === "default" && "text-foreground",
          tone === "muted" && "text-muted-foreground",
          tone === "up" && "text-outcome-up",
          tone === "down" && "text-outcome-down"
        )}
      >
        {value}
      </div>
    </div>
  )
}

function getRealizedPnlDomain(points: RealizedPnlPoint[]) {
  const values = points.map((point) => point.cumulativePnlUsd)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const range = max - min
  const padding = Math.max(range * 0.12, 0.05)

  if (max <= 0) {
    return [min - padding, 0] satisfies [number, number]
  }

  if (min >= 0) {
    return [0, max + padding] satisfies [number, number]
  }

  return [min - padding, max + padding] satisfies [number, number]
}

function getRealizedPnlTicks(domain: [number, number]) {
  const [min, max] = domain
  const range = max - min

  if (range <= 0) {
    return [min]
  }

  return Array.from({ length: 5 }, (_, index) => min + (range * index) / 4)
}

function formatPnlAxisTick(value: number) {
  if (Math.abs(value) < 0.005) {
    return "0 DUSDC"
  }

  const absoluteValue = Math.abs(value)
  const fractionDigits = absoluteValue < 10 ? 2 : absoluteValue < 100 ? 1 : 0
  const formatted = formatDusdc(absoluteValue, fractionDigits)

  return value < 0 ? `-${formatted}` : formatted
}

function getDisplayRealizedPnlPoints(points: RealizedPnlPoint[]) {
  const [firstPoint] = points

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!firstPoint) {
    return []
  }

  const syntheticStart = {
    ...firstPoint,
    contractLabel: "Breakeven",
    id: `${firstPoint.id}:start`,
    pnlUsd: 0,
    cumulativePnlUsd: 0,
    timestampMs: firstPoint.timestampMs - 60_000,
  }

  return [syntheticStart, ...points]
}

function getIntervalStartMs(interval: ChartInterval, nowMs = Date.now()) {
  if (interval === "1d") {
    return nowMs - 24 * 60 * 60_000
  }

  if (interval === "1w") {
    return nowMs - 7 * 24 * 60 * 60_000
  }

  if (interval === "1m") {
    return nowMs - 30 * 24 * 60 * 60_000
  }

  return undefined
}

function getIntervalRealizedPnlPoints(
  points: RealizedPnlPoint[],
  interval: ChartInterval
) {
  const startMs = getIntervalStartMs(interval)
  const filteredPoints = startMs
    ? points.filter((point) => point.timestampMs >= startMs)
    : points
  let cumulativePnlUsd = 0

  return filteredPoints.map((point) => {
    cumulativePnlUsd += point.pnlUsd

    return {
      ...point,
      cumulativePnlUsd,
    }
  })
}

function PortfolioChartCard({
  isLoading,
  realizedPnlPoints,
  summary,
}: {
  isLoading: boolean
  realizedPnlPoints: RealizedPnlPoint[]
  summary: PortfolioSummary
}) {
  const [chartMode, setChartMode] = useState<ChartMode>("realized")
  const [chartInterval, setChartInterval] = useState<ChartInterval>("max")
  const visibleRealizedPnlPoints = getIntervalRealizedPnlPoints(
    realizedPnlPoints,
    chartInterval
  )
  const visibleRealizedPnl =
    visibleRealizedPnlPoints.at(-1)?.cumulativePnlUsd ?? 0
  const chartConfig = {
    cumulativePnlUsd: {
      color:
        visibleRealizedPnl >= 0 ? "var(--outcome-up)" : "var(--outcome-down)",
      label: "Realized P&L",
    },
  } satisfies ChartConfig
  const chartPoints = getDisplayRealizedPnlPoints(visibleRealizedPnlPoints)
  const yDomain = getRealizedPnlDomain(chartPoints)
  const yTicks = getRealizedPnlTicks(yDomain)

  return (
    <Card className="min-h-[17rem] gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <div className="flex items-center justify-between gap-3 border-b border-border/45 px-4 py-3">
        <Tabs
          className="min-w-0 gap-0"
          value={chartMode}
          onValueChange={(value) => setChartMode(value as ChartMode)}
        >
          <TabsList
            className="h-full w-full justify-start gap-5 overflow-x-auto rounded-none p-0"
            variant="line"
          >
            <TabsTrigger
              className="flex-none rounded-none px-0 text-xs font-medium tracking-[-0.01em] text-muted-foreground transition-[color] duration-150 after:bg-primary hover:text-foreground data-active:text-foreground"
              value="realized"
            >
              Realized PnL
            </TabsTrigger>
            <TabsTrigger
              className="flex-none rounded-none px-0 text-xs font-medium tracking-[-0.01em] text-muted-foreground transition-[color] duration-150 after:bg-primary hover:text-foreground data-active:text-foreground"
              value="exposure"
            >
              Exposure
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {chartMode === "realized" ? (
          <div className="hidden items-center gap-1 sm:flex">
            {chartIntervals.map((interval) => (
              <Button
                className="h-7 px-2.5 font-mono text-[11px] text-muted-foreground data-[active=true]:text-foreground"
                data-active={chartInterval === interval.value}
                key={interval.value}
                size="xs"
                type="button"
                variant={
                  chartInterval === interval.value ? "secondary" : "ghost"
                }
                onClick={() => setChartInterval(interval.value)}
              >
                {interval.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-52 place-items-center px-4 py-3">
        {isLoading ? (
          <SkeletonPanel />
        ) : chartMode === "exposure" ? (
          <ExposurePanel summary={summary} />
        ) : visibleRealizedPnlPoints.length === 0 ? (
          <div className="text-center">
            <DusdcValue className="text-2xl text-muted-foreground" value={0} />
            <p className="mt-10 text-sm text-muted-foreground">
              No realized P&L yet. Close or redeem a position to start the
              chart.
            </p>
          </div>
        ) : (
          <div className="h-52 w-full">
            <div
              className={cn(
                "mb-2 text-xl font-medium",
                getPnlClassName(visibleRealizedPnl)
              )}
            >
              <SignedDusdcValue value={visibleRealizedPnl} />
            </div>
            <ChartContainer
              className="h-40 w-full [&_.recharts-cartesian-axis-tick_text]:font-mono"
              config={chartConfig}
            >
              <AreaChart
                accessibilityLayer
                baseValue={yDomain[0]}
                data={chartPoints}
                margin={{ bottom: 0, left: 4, right: 12, top: 10 }}
              >
                <defs>
                  <linearGradient
                    id="realizedPnlGradient"
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-cumulativePnlUsd)"
                      stopOpacity={0.18}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-cumulativePnlUsd)"
                      stopOpacity={0.03}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="timestampMs"
                  domain={["dataMin", "dataMax"]}
                  minTickGap={28}
                  scale="time"
                  tick={axisTick}
                  tickFormatter={(value) =>
                    typeof value === "number"
                      ? shortDateFormatter.format(value)
                      : ""
                  }
                  tickLine={false}
                  tickMargin={10}
                  type="number"
                />
                <YAxis
                  axisLine={false}
                  domain={yDomain}
                  tick={axisTick}
                  ticks={yTicks}
                  tickFormatter={(value) =>
                    typeof value === "number" ? formatPnlAxisTick(value) : ""
                  }
                  tickLine={false}
                  tickMargin={10}
                  width={82}
                />
                <ReferenceLine
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.35}
                  y={0}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        typeof value === "number"
                          ? formatSignedDusdc(value)
                          : String(value)
                      }
                      labelFormatter={(_, payload) => {
                        const point = payload[0]?.payload as
                          | RealizedPnlPoint
                          | undefined

                        if (!point) {
                          return "Realized P&L"
                        }

                        return `${point.contractLabel} · ${fullDateFormatter.format(point.timestampMs)}`
                      }}
                    />
                  }
                />
                <Area
                  dataKey="cumulativePnlUsd"
                  fill="url(#realizedPnlGradient)"
                  fillOpacity={1}
                  isAnimationActive={false}
                  name="Realized P&L"
                  stroke="var(--color-cumulativePnlUsd)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ChartContainer>
          </div>
        )}
      </div>
    </Card>
  )
}

function SkeletonPanel() {
  return (
    <div className="grid w-full max-w-2xl gap-4">
      <div className="h-7 w-32 rounded-md bg-muted" />
      <div className="mt-8 h-2 rounded-full bg-muted" />
      <div className="h-2 w-3/4 rounded-full bg-muted" />
      <div className="h-2 w-1/2 rounded-full bg-muted" />
    </div>
  )
}

function ExposurePanel({ summary }: { summary: PortfolioSummary }) {
  const total = summary.openCostBasisUsd
  const segments = [
    { label: "Up", tone: "up", value: summary.upCostBasisUsd },
    { label: "Down", tone: "down", value: summary.downCostBasisUsd },
    { label: "Range", tone: "range", value: summary.rangeCostBasisUsd },
  ] satisfies ExposureSegment[]

  if (total <= 0) {
    return (
      <div className="grid w-full max-w-2xl place-items-center gap-2 text-center">
        <DusdcValue className="text-2xl text-muted-foreground" value={0} />
        <div className="text-sm font-medium text-foreground">
          No open exposure
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">
          Open positions will appear here once DUSDC is deployed.
        </p>
      </div>
    )
  }

  return (
    <div className="grid w-full max-w-3xl gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Open Cost Basis</div>
          <DusdcValue
            className="mt-1 text-xl font-medium text-foreground"
            value={total}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Current allocation across open Predict positions
        </div>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-muted/45">
        {segments.map((segment) => {
          const percent = segment.value / total

          return segment.value > 0 ? (
            <div
              className={cn("h-full", getExposureBgClassName(segment.tone))}
              key={segment.label}
              style={{ flexBasis: `${percent * 100}%` }}
            />
          ) : null
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {segments.map((segment) => (
          <ExposureTile key={segment.label} segment={segment} total={total} />
        ))}
      </div>
    </div>
  )
}

type ExposureTone = "up" | "down" | "range"

interface ExposureSegment {
  label: string
  tone: ExposureTone
  value: number
}

function getExposureTextClassName(tone: ExposureTone) {
  if (tone === "up") {
    return "text-outcome-up"
  }

  if (tone === "down") {
    return "text-outcome-down"
  }

  return "text-primary"
}

function getExposureBgClassName(tone: ExposureTone) {
  if (tone === "up") {
    return "bg-outcome-up"
  }

  if (tone === "down") {
    return "bg-outcome-down"
  }

  return "bg-primary"
}

function ExposureTile({
  segment,
  total,
}: {
  segment: ExposureSegment
  total: number
}) {
  const percent = total > 0 ? segment.value / total : 0

  return (
    <div className="min-w-0 overflow-hidden rounded-md bg-muted/25 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "text-xs font-medium",
            getExposureTextClassName(segment.tone)
          )}
        >
          {segment.label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
          {formatPercent(percent)}
        </span>
      </div>
      <DusdcValue
        className="mt-2 text-sm font-medium text-foreground"
        value={segment.value}
      />
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-background/45">
        <div
          className={cn(
            "h-full rounded-full",
            getExposureBgClassName(segment.tone)
          )}
          style={{
            width: `${Math.max(percent * 100, segment.value > 0 ? 4 : 0)}%`,
          }}
        />
      </div>
    </div>
  )
}

function PositionsLedger({
  activeTab,
  isLoading,
  onRedeemPosition,
  onSearchChange,
  onTabChange,
  positions,
  redeemingPositionId,
  searchQuery,
  totalPositions,
}: {
  activeTab: PortfolioTab
  isLoading: boolean
  onRedeemPosition: (position: PortfolioPosition) => void
  onSearchChange: (value: string) => void
  onTabChange: (value: PortfolioTab) => void
  positions: PortfolioPosition[]
  redeemingPositionId?: string
  searchQuery: string
  totalPositions: PortfolioPosition[]
}) {
  return (
    <Card className="min-h-96 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <Tabs
        className="flex min-h-96 min-w-0 flex-col gap-0"
        value={activeTab}
        onValueChange={(value) => onTabChange(value as PortfolioTab)}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-border/45 px-4 py-3 lg:h-11 lg:flex-row lg:items-center lg:justify-between lg:py-0">
          <TabsList
            className="h-full w-full justify-start gap-5 overflow-x-auto rounded-none p-0"
            variant="line"
          >
            {portfolioTabs.map((tab) => (
              <TabsTrigger
                className="flex-none rounded-none px-0 text-xs font-medium tracking-[-0.01em] text-muted-foreground transition-[color] duration-150 after:bg-primary hover:text-foreground data-active:text-foreground"
                key={tab.value}
                value={tab.value}
              >
                <span>{tab.label}</span>
                <span className="rounded-sm bg-muted/45 px-1.5 py-0.5 font-mono text-[10px] leading-none text-current tabular-nums opacity-80">
                  {getTabCount(totalPositions, tab.value)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="relative w-full lg:w-72">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8"
              placeholder="Search markets"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        </div>

        {portfolioTabs.map((tab) => (
          <TabsContent
            className="min-h-0 flex-1 overflow-hidden"
            key={tab.value}
            value={tab.value}
          >
            {tab.value === "activity" ? (
              <ActivityTable isLoading={isLoading} positions={positions} />
            ) : (
              <>
                <div className="hidden h-full min-h-0 overflow-auto lg:block">
                  <PositionsTable
                    isLoading={isLoading}
                    onRedeemPosition={onRedeemPosition}
                    positions={positions}
                    redeemingPositionId={redeemingPositionId}
                  />
                </div>
                <div className="grid gap-2 p-3 lg:hidden">
                  <MobilePositionsList
                    isLoading={isLoading}
                    onRedeemPosition={onRedeemPosition}
                    positions={positions}
                    redeemingPositionId={redeemingPositionId}
                  />
                </div>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  )
}

function PortfolioHeaderRow({
  className,
  columns,
}: {
  className: string
  columns: Array<{ align?: "left" | "right"; label: string }>
}) {
  return (
    <div
      className={cn(
        "grid gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase",
        className
      )}
    >
      {columns.map((column, index) => (
        <span
          className={cn("truncate", column.align === "right" && "text-right")}
          key={`${column.label}-${index}`}
        >
          {column.label}
        </span>
      ))}
    </div>
  )
}

function PositionTypeTag({ position }: { position: PortfolioPosition }) {
  return (
    <span
      className={cn(
        "inline-flex w-9 shrink-0 font-mono text-[10px] tracking-wide uppercase",
        getPositionTypeClassName(position.type)
      )}
    >
      {position.type}
    </span>
  )
}

function PositionAction({
  onRedeemPosition,
  position,
  redeemingPositionId,
}: {
  onRedeemPosition: (position: PortfolioPosition) => void
  position: PortfolioPosition
  redeemingPositionId?: string
}) {
  return canRedeemPortfolioPosition(position) ? (
    <Button
      className="justify-self-end"
      disabled={redeemingPositionId === position.id}
      size="xs"
      type="button"
      variant="secondary"
      onClick={() => onRedeemPosition(position)}
    >
      {redeemingPositionId === position.id ? "Redeeming..." : "Redeem"}
    </Button>
  ) : (
    <Button
      className="justify-self-end text-muted-foreground"
      render={
        <Link
          params={{ oracleId: position.oracleId }}
          search={position.manageSearch}
          to="/markets/$oracleId"
        />
      }
      size="xs"
      type="button"
      variant="ghost"
    >
      Manage
      <ArrowUpRightIcon className="size-3" />
    </Button>
  )
}

function PositionsTable({
  isLoading,
  onRedeemPosition,
  positions,
  redeemingPositionId,
}: {
  isLoading: boolean
  onRedeemPosition: (position: PortfolioPosition) => void
  positions: PortfolioPosition[]
  redeemingPositionId?: string
}) {
  if (isLoading) {
    return <LedgerEmptyState message="Loading portfolio positions." />
  }

  if (positions.length === 0) {
    return <LedgerEmptyState message="No positions in this view." />
  }

  const hasUnavailableValues = positions.some(
    (position) => position.size > 0 && position.currentValueUsd === null
  )

  return (
    <div className="min-w-[56rem]">
      {hasUnavailableValues ? (
        <div className="border-b border-border/35 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Live exit values are unavailable. Entry and premium are shown from
          trade history.
        </div>
      ) : null}
      <PortfolioHeaderRow
        className="grid-cols-[minmax(13rem,1.8fr)_7rem_5.25rem_6.5rem_6.5rem_5.5rem]"
        columns={[
          { label: "Contract" },
          { align: "right", label: "Contracts" },
          { align: "right", label: "Avg entry" },
          { align: "right", label: "Value" },
          { align: "right", label: "PnL" },
          { align: "right", label: "" },
        ]}
      />
      {positions.map((position) => (
        <div
          className="grid grid-cols-[minmax(13rem,1.8fr)_7rem_5.25rem_6.5rem_6.5rem_5.5rem] items-center gap-4 border-b border-border/35 px-3 py-2 text-xs last:border-b-0"
          key={position.id}
        >
          <PositionMarketCell position={position} />
          <span className="truncate text-right font-mono text-muted-foreground tabular-nums">
            {formatQuantity(position.size)}
          </span>
          <span className="truncate text-right font-mono tabular-nums">
            {formatCents(position.averageEntryPrice)}
          </span>
          <span className="truncate text-right font-mono tabular-nums">
            {position.currentValueUsd === null
              ? "--"
              : formatDusdc(position.currentValueUsd)}
          </span>
          <span
            className={cn(
              "truncate text-right font-mono tabular-nums",
              getPnlClassName(position.unrealizedPnlUsd)
            )}
          >
            {position.unrealizedPnlUsd === null
              ? "--"
              : formatSignedDusdc(position.unrealizedPnlUsd)}
          </span>
          <PositionAction
            onRedeemPosition={onRedeemPosition}
            position={position}
            redeemingPositionId={redeemingPositionId}
          />
        </div>
      ))}
    </div>
  )
}

function PositionMarketCell({ position }: { position: PortfolioPosition }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <PositionTypeTag position={position} />
        <span className="truncate font-medium text-foreground">
          {position.contractLabel}
        </span>
      </div>
      <div className="mt-0.5 flex min-w-0 items-center gap-2">
        <div className="truncate font-mono text-[10px] text-muted-foreground uppercase">
          {position.status} · {formatExpiryDistance(position.expiryMs)} ·{" "}
          {formatRelativeTime(position.lastActivityAt)}
        </div>
        <ReservationBadge position={position} />
      </div>
    </div>
  )
}

function ReservationBadge({ position }: { position: PortfolioPosition }) {
  if (!position.reservationLabel) {
    return null
  }

  return (
    <span className="shrink-0 rounded-sm border border-amber-500/25 bg-amber-500/5 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-amber-200/90 uppercase">
      {position.reservationLabel}
    </span>
  )
}

function LedgerEmptyState({ message }: { message: string }) {
  return (
    <div className="grid min-h-56 place-items-center px-3 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function MobilePositionsList({
  isLoading,
  onRedeemPosition,
  positions,
  redeemingPositionId,
}: {
  isLoading: boolean
  onRedeemPosition: (position: PortfolioPosition) => void
  positions: PortfolioPosition[]
  redeemingPositionId?: string
}) {
  if (isLoading) {
    return <LedgerEmptyState message="Loading portfolio positions." />
  }

  if (positions.length === 0) {
    return <LedgerEmptyState message="No positions in this view." />
  }

  const hasUnavailableValues = positions.some(
    (position) => position.size > 0 && position.currentValueUsd === null
  )

  return (
    <>
      {hasUnavailableValues ? (
        <div className="rounded-md border border-border/35 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Live exit values are unavailable. Entry and premium are shown from
          trade history.
        </div>
      ) : null}
      {positions.map((position) => (
        <div
          className="rounded-md border border-border/35 bg-muted/15 px-3 py-3"
          key={position.id}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "font-mono text-[10px] tracking-wide",
                    getPositionTypeClassName(position.type)
                  )}
                >
                  {position.type}
                </span>
                <span className="truncate text-sm font-medium text-foreground">
                  {position.contractLabel}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatQuantity(position.size)} contracts
              </div>
              {position.reservationLabel ? (
                <div className="mt-2">
                  <ReservationBadge position={position} />
                </div>
              ) : null}
            </div>
            {canRedeemPortfolioPosition(position) ? (
              <Button
                disabled={redeemingPositionId === position.id}
                size="xs"
                type="button"
                variant="secondary"
                onClick={() => onRedeemPosition(position)}
              >
                {redeemingPositionId === position.id
                  ? "Redeeming..."
                  : "Redeem"}
              </Button>
            ) : (
              <Button
                render={
                  <Link
                    params={{ oracleId: position.oracleId }}
                    search={position.manageSearch}
                    to="/markets/$oracleId"
                  />
                }
                size="xs"
                type="button"
                variant="ghost"
              >
                Manage
              </Button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/35 pt-3 text-xs">
            <MobileStat
              label="Avg entry"
              value={formatCents(position.averageEntryPrice)}
            />
            <MobileStat
              label="Premium"
              value={formatDusdc(position.costBasisUsd)}
            />
            <MobileStat
              label="Value"
              value={
                position.currentValueUsd === null
                  ? "--"
                  : formatDusdc(position.currentValueUsd)
              }
            />
            <MobileStat
              className={getPnlClassName(position.unrealizedPnlUsd)}
              label="PnL"
              value={
                position.unrealizedPnlUsd === null
                  ? "--"
                  : formatSignedDusdc(position.unrealizedPnlUsd)
              }
            />
          </div>
          <div className="mt-3 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {position.status} · {formatRelativeTime(position.lastActivityAt)}
          </div>
        </div>
      ))}
    </>
  )
}

function MobileStat({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-md bg-background/35 px-2.5 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-mono text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}

function ActivityTable({
  isLoading,
  positions,
}: {
  isLoading: boolean
  positions: PortfolioPosition[]
}) {
  if (isLoading) {
    return <LedgerEmptyState message="Loading portfolio activity." />
  }

  if (positions.length === 0) {
    return <LedgerEmptyState message="No recent portfolio activity." />
  }

  const hasUnavailableValues = positions.some(
    (position) => position.size > 0 && position.currentValueUsd === null
  )

  return (
    <>
      <div className="hidden h-full min-h-0 overflow-auto lg:block">
        <div className="min-w-[54rem]">
          {hasUnavailableValues ? (
            <div className="border-b border-border/35 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Live exit values are unavailable. Entry and premium are shown from
              trade history.
            </div>
          ) : null}
          <PortfolioHeaderRow
            className="grid-cols-[minmax(13rem,1.9fr)_7rem_6.5rem_6.5rem_6rem_5.5rem]"
            columns={[
              { label: "Contract" },
              { label: "Contracts" },
              { align: "right", label: "Value" },
              { align: "right", label: "PnL" },
              { label: "Status" },
              { align: "right", label: "Time" },
            ]}
          />
          {positions.map((position) => (
            <div
              className="grid grid-cols-[minmax(13rem,1.9fr)_7rem_6.5rem_6.5rem_6rem_5.5rem] items-center gap-4 border-b border-border/35 px-3 py-2 text-xs last:border-b-0"
              key={position.id}
            >
              <PositionMarketCell position={position} />
              <span className="truncate font-mono text-muted-foreground tabular-nums">
                {formatQuantity(position.size)}
              </span>
              <span className="truncate text-right font-mono tabular-nums">
                {position.currentValueUsd === null
                  ? "--"
                  : formatDusdc(position.currentValueUsd)}
              </span>
              <span
                className={cn(
                  "truncate text-right font-mono tabular-nums",
                  getPnlClassName(position.unrealizedPnlUsd)
                )}
              >
                {position.unrealizedPnlUsd === null
                  ? "--"
                  : formatSignedDusdc(position.unrealizedPnlUsd)}
              </span>
              <span className="truncate text-muted-foreground capitalize">
                {position.status}
              </span>
              <span className="text-right font-mono text-muted-foreground tabular-nums">
                {formatRelativeTime(position.lastActivityAt)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2 p-3 lg:hidden">
        {hasUnavailableValues ? (
          <div className="rounded-md border border-border/35 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Live exit values are unavailable. Entry and premium are shown from
            trade history.
          </div>
        ) : null}
        {positions.map((position) => (
          <div
            className="rounded-md border border-border/35 bg-muted/15 px-3 py-3"
            key={position.id}
          >
            <div className="flex min-w-0 items-center gap-2">
              <PositionTypeTag position={position} />
              <span className="truncate text-sm font-medium text-foreground">
                {position.contractLabel}
              </span>
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {position.status} · {formatRelativeTime(position.lastActivityAt)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/35 pt-3 text-xs">
              <MobileStat
                label="Contracts"
                value={formatQuantity(position.size)}
              />
              <MobileStat
                label="Value"
                value={
                  position.currentValueUsd === null
                    ? "--"
                    : formatDusdc(position.currentValueUsd)
                }
              />
              <MobileStat
                className={getPnlClassName(position.unrealizedPnlUsd)}
                label="PnL"
                value={
                  position.unrealizedPnlUsd === null
                    ? "--"
                    : formatSignedDusdc(position.unrealizedPnlUsd)
                }
              />
              <MobileStat
                label="Expiry"
                value={formatExpiryDistance(position.expiryMs)}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
