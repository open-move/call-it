import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { formatAddress } from "@mysten/sui/utils"
import { ArrowUpRightIcon, SearchIcon, WalletIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
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
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
  
} from "@/components/ui/chart"
import type {ChartConfig} from "@/components/ui/chart";
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatRelativeTime, formatUsd } from "@/lib/format"
import {
  PREDICT_LP_ASSET,
  PREDICT_QUOTE_ASSET,
  PREDICT_QUOTE_DECIMALS,
  PREDICT_PRICE_SCALE as PRICE_SCALE,
  QUOTE_SCALE,
} from "@/lib/config"
import {
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
  getManagerPositionSummaries,
  getManagerRanges,
  getPredictManagers,
} from "@/services/predict-client"
import type {DirectionalPositionMintEvent, DirectionalPositionRedeemEvent, ManagerPositionSummary, ManagerRangeActivityResponse, OracleInfo, RangeMintEvent, RangeRedeemEvent, VaultSummary} from "@/lib/types/predict";
import { getSuiGrpcClient } from "@/services/sui-client"
import { cn } from "@/lib/utils"

export interface PageProps {
  oracles: OracleInfo[]
  vaultSummary: VaultSummary
}

type PortfolioTab = "open" | "redeemable" | "closed" | "activity"
type PositionType = "UP" | "DOWN" | "RNG"
type ChartMode = "realized" | "exposure"
type ChartInterval = "1d" | "1w" | "1m" | "max"

interface PortfolioPosition {
  assetSymbol: string
  averageEntryPrice: number | null
  contractLabel: string
  costBasisUsd: number
  currentValueUsd: number | null
  expiryMs: number
  id: string
  lastActivityAt: number
  manageHref: string
  markPrice: number | null
  oracleId: string
  realizedPnlUsd: number
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

function formatQuantity(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 })
}

function formatCents(value: number | null) {
  return value === null ? "--" : `${(value * 100).toFixed(1)}c`
}

function formatSignedUsd(value: number) {
  if (value > 0) {
    return `+${formatUsd(value)}`
  }

  if (value < 0) {
    return `-${formatUsd(Math.abs(value))}`
  }

  return formatUsd(0)
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value)
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

function getMarketHref(position: PortfolioPosition) {
  return position.manageHref
}

function getDirectionalPositions(
  summaries: ManagerPositionSummary[],
  oracleById: Map<string, OracleInfo>
): PortfolioPosition[] {
  return summaries
    .filter((summary) => summary.open_quantity > 0)
    .map((summary) => {
      const assetSymbol = getAssetSymbol(oracleById, summary.oracle_id)
      const strikePriceUsd = toUsdPrice(summary.strike)
      const side = summary.is_up ? "up" : "down"
      const type = summary.is_up ? "UP" : "DOWN"
      const searchParams = new URLSearchParams({
        side,
        strike: strikePriceUsd.toString(),
      })

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
        manageHref: `/markets/${summary.oracle_id}?${searchParams.toString()}`,
        markPrice:
          summary.mark_price === null ? null : toUsdPrice(summary.mark_price),
        oracleId: summary.oracle_id,
        realizedPnlUsd: toQuoteAmount(summary.realized_pnl),
        size: toQuoteAmount(summary.open_quantity),
        status: summary.status,
        type,
        unrealizedPnlUsd: toQuoteAmount(summary.unrealized_pnl),
      }
    })
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
      const searchParams = new URLSearchParams({
        strike: lowerStrikePriceUsd.toString(),
      })

      return {
        assetSymbol,
        averageEntryPrice,
        contractLabel: `${assetSymbol} ${formatUsd(lowerStrikePriceUsd, 0)}-${formatUsd(higherStrikePriceUsd, 0)} Range`,
        costBasisUsd: averageEntryPrice === null ? 0 : averageEntryPrice * size,
        currentValueUsd: null,
        expiryMs: oracleById.get(position.oracleId)?.expiry ?? 0,
        id,
        lastActivityAt: position.lastActivityAt,
        manageHref: `/markets/${position.oracleId}?${searchParams.toString()}`,
        markPrice: null,
        oracleId: position.oracleId,
        realizedPnlUsd: toQuoteAmount(position.totalPayout) - redeemedCostBasis,
        size,
        status: "open",
        type: "RNG" as const,
        unrealizedPnlUsd: null,
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
  summaries,
}: {
  oracleById: Map<string, OracleInfo>
  rangeActivity: ManagerRangeActivityResponse
  summaries: ManagerPositionSummary[]
}) {
  return [
    ...getDirectionalPositions(summaries, oracleById),
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
    (total, position) =>
      total + (position.currentValueUsd ?? position.costBasisUsd),
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
    const matchesTab =
      tab === "activity" ||
      (tab === "open" && status !== "redeemable") ||
      (tab === "redeemable" && status === "redeemable") ||
      (tab === "closed" &&
        (status === "closed" || status === "lost" || status === "liquidated"))

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
  const [portfolioState, setPortfolioState] = useState<PortfolioState>({
    dusdcBalance: 0n,
    isLoading: false,
    plpBalance: 0n,
    positions: [],
    realizedPnlPoints: [],
  })
  const [activeTab, setActiveTab] = useState<PortfolioTab>("open")
  const [searchQuery, setSearchQuery] = useState("")
  const walletAddress = primaryWallet?.address
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

      setPortfolioState((currentState) => ({
        ...currentState,
        errorMessage: undefined,
        isLoading: true,
      }))

      try {
        const client = getSuiGrpcClient()
        const [dusdcBalance, plpBalance, managers] = await Promise.all([
          client.getBalance({
            coinType: PREDICT_QUOTE_ASSET,
            owner: walletAddress,
          }),
          client.getBalance({
            coinType: PREDICT_LP_ASSET,
            owner: walletAddress,
          }),
          getPredictManagers(walletAddress),
        ])
        const [manager] = managers

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!manager) {
          if (!isStale) {
            setPortfolioState({
              dusdcBalance: BigInt(dusdcBalance.balance.balance),
              isLoading: false,
              plpBalance: BigInt(plpBalance.balance.balance),
              positions: [],
              realizedPnlPoints: [],
            })
          }
          return
        }

        const [
          summaries,
          rangeActivity,
          directionalMinted,
          directionalRedeemed,
        ] = await Promise.all([
          getManagerPositionSummaries(manager.manager_id),
          getManagerRanges(manager.manager_id),
          getDirectionalPositionMints(REALIZED_ACTIVITY_LIMIT),
          getDirectionalPositionRedeems(REALIZED_ACTIVITY_LIMIT),
        ])

        if (!isStale) {
          const currentOracleById = getOracleById(oracles)

          setPortfolioState({
            dusdcBalance: BigInt(dusdcBalance.balance.balance),
            isLoading: false,
            managerId: manager.manager_id,
            plpBalance: BigInt(plpBalance.balance.balance),
            positions: getPortfolioPositions({
              oracleById: currentOracleById,
              rangeActivity,
              summaries,
            }),
            realizedPnlPoints: getRealizedPnlChartData({
              directionalMinted: directionalMinted.filter(
                (event) => event.manager_id === manager.manager_id
              ),
              directionalRedeemed: directionalRedeemed.filter(
                (event) => event.manager_id === manager.manager_id
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
  }, [oracles, walletAddress])

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3">
        {!walletAddress ? (
          <ConnectPortfolioCard onConnect={() => setShowAuthFlow(true)} />
        ) : (
          <>
            <section className="grid gap-3 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
              <AccountCard summary={summary} />

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

            <PositionsLedger
              activeTab={activeTab}
              isLoading={portfolioState.isLoading}
              positions={filteredPositions}
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

function AccountCard({ summary }: { summary: PortfolioSummary }) {
  return (
    <Card className="gap-2 rounded-md border-0 bg-card py-0 pt-3 shadow-none ring-0">
      <div className="grid gap-4 px-3 py-3">
        <div>
          <div className="truncate text-xs text-muted-foreground">
            Total Value
          </div>

          <div>
            <div className="mt-1 font-mono text-2xl font-medium tracking-tight text-foreground tabular-nums">
              {formatUsd(summary.portfolioValueUsd)}
            </div>

            <div
              className={cn(
                "mt-1 text-xs",
                getPnlClassName(summary.unrealizedPnlUsd)
              )}
            >
              {formatSignedUsd(summary.unrealizedPnlUsd)} unrealized
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Metric
            label="Cash Balance"
            value={formatUsd(summary.availableDusdc)}
          />
          <Metric label="PLP Value" value={formatUsd(summary.plpValueUsd)} />
          <Metric
            label="Open Cost"
            value={formatUsd(summary.openCostBasisUsd)}
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
            value={formatSignedUsd(summary.realizedPnlUsd)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button">Deposit</Button>
          <Button type="button" variant="secondary">
            Withdraw
          </Button>
        </div>
      </div>
    </Card>
  )
}

function Metric({
  label,
  tone = "default",
  value,
}: {
  label: string
  tone?: "default" | "muted" | "up" | "down"
  value: string
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/35 px-2.5 py-2">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-sm font-medium tabular-nums",
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
    return "$0.00"
  }

  const absoluteValue = Math.abs(value)
  const fractionDigits = absoluteValue < 10 ? 2 : absoluteValue < 100 ? 1 : 0
  const formatted = formatUsd(absoluteValue, fractionDigits)

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
    <Card className="min-h-[17rem] gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-3">
        <Tabs
          className="gap-0"
          value={chartMode}
          onValueChange={(value) => setChartMode(value as ChartMode)}
        >
          <TabsList className="h-8 rounded-md bg-muted p-0.5">
            <TabsTrigger className="text-xs" value="realized">
              Realized PnL
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="exposure">
              Exposure
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="hidden items-center gap-1 sm:flex">
          {chartIntervals.map((interval) => (
            <Button
              className="font-mono text-xs text-muted-foreground data-[active=true]:text-foreground"
              data-active={chartInterval === interval.value}
              key={interval.value}
              size="xs"
              type="button"
              variant={chartInterval === interval.value ? "secondary" : "ghost"}
              onClick={() => setChartInterval(interval.value)}
            >
              {interval.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid min-h-52 place-items-center px-3 py-3">
        {isLoading ? (
          <SkeletonPanel />
        ) : chartMode === "exposure" ? (
          <ExposurePanel summary={summary} />
        ) : visibleRealizedPnlPoints.length === 0 ? (
          <div className="text-center">
            <div className="font-mono text-2xl text-muted-foreground tabular-nums">
              {formatUsd(0)}
            </div>
            <p className="mt-10 text-sm text-muted-foreground">
              No realized P&L yet. Close or redeem a position to start the
              chart.
            </p>
          </div>
        ) : (
          <div className="h-52 w-full">
            <div
              className={cn(
                "mb-2 font-mono text-xl tabular-nums",
                getPnlClassName(visibleRealizedPnl)
              )}
            >
              {formatSignedUsd(visibleRealizedPnl)}
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
                  width={64}
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
                          ? formatSignedUsd(value)
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
  return (
    <div className="grid w-full max-w-2xl gap-4">
      <div>
        <div className="font-mono text-xl text-foreground tabular-nums">
          {formatUsd(summary.openCostBasisUsd)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Open prediction cost basis
        </div>
      </div>
      <div className="grid gap-3">
        <ExposureBar
          label="Up"
          tone="up"
          total={summary.openCostBasisUsd}
          value={summary.upCostBasisUsd}
        />
        <ExposureBar
          label="Down"
          tone="down"
          total={summary.openCostBasisUsd}
          value={summary.downCostBasisUsd}
        />
        <ExposureBar
          label="Range"
          tone="range"
          total={summary.openCostBasisUsd}
          value={summary.rangeCostBasisUsd}
        />
      </div>
    </div>
  )
}

function ExposureBar({
  label,
  tone,
  total,
  value,
}: {
  label: string
  tone: "up" | "down" | "range"
  total: number
  value: number
}) {
  const percent = total > 0 ? value / total : 0

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span
          className={cn(
            tone === "up" && "text-outcome-up",
            tone === "down" && "text-outcome-down",
            tone === "range" && "text-primary"
          )}
        >
          {label}
        </span>
        <span className="font-mono text-foreground tabular-nums">
          {formatUsd(value)} · {formatPercent(percent)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "up" && "bg-outcome-up",
            tone === "down" && "bg-outcome-down",
            tone === "range" && "bg-primary"
          )}
          style={{ width: `${Math.max(percent * 100, value > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  )
}

function PositionsLedger({
  activeTab,
  isLoading,
  onSearchChange,
  onTabChange,
  positions,
  searchQuery,
  totalPositions,
}: {
  activeTab: PortfolioTab
  isLoading: boolean
  onSearchChange: (value: string) => void
  onTabChange: (value: PortfolioTab) => void
  positions: PortfolioPosition[]
  searchQuery: string
  totalPositions: PortfolioPosition[]
}) {
  return (
    <Card className="min-h-96 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <div className="flex flex-col gap-3 border-b border-border/40 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          {portfolioTabs.map((tab) => (
            <Button
              className={cn(
                "text-muted-foreground",
                activeTab === tab.value && "bg-muted text-foreground"
              )}
              key={tab.value}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => onTabChange(tab.value)}
            >
              {tab.label}
              <span className="rounded-sm bg-foreground/8 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                {getTabCount(totalPositions, tab.value)}
              </span>
            </Button>
          ))}
        </div>

        <div className="relative w-full lg:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search markets"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>

      {activeTab === "activity" ? (
        <ActivityList isLoading={isLoading} positions={positions} />
      ) : (
        <>
          <div className="hidden overflow-auto lg:block">
            <PositionsTable isLoading={isLoading} positions={positions} />
          </div>
          <div className="grid gap-2 p-3 lg:hidden">
            <MobilePositionsList isLoading={isLoading} positions={positions} />
          </div>
        </>
      )}
    </Card>
  )
}

function PositionsTable({
  isLoading,
  positions,
}: {
  isLoading: boolean
  positions: PortfolioPosition[]
}) {
  if (isLoading) {
    return <LedgerEmptyState message="Loading portfolio positions." />
  }

  if (positions.length === 0) {
    return <LedgerEmptyState message="No positions in this view." />
  }

  return (
    <div className="min-w-[62rem]">
      <div className="grid grid-cols-[minmax(14rem,1.8fr)_4rem_7rem_5rem_5rem_7rem_7rem_7rem_5rem] gap-4 border-b border-border/40 bg-muted/35 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        <span>Market</span>
        <span>Type</span>
        <span>Size</span>
        <span>Entry</span>
        <span>Mark</span>
        <span>Value</span>
        <span>PnL</span>
        <span>Status</span>
        <span className="text-right">Action</span>
      </div>
      {positions.map((position) => (
        <div
          className="grid grid-cols-[minmax(14rem,1.8fr)_4rem_7rem_5rem_5rem_7rem_7rem_7rem_5rem] items-center gap-4 border-b border-border/30 px-3 py-2.5 text-xs"
          key={position.id}
        >
          <PositionMarketCell position={position} />
          <span
            className={cn(
              "font-mono text-[10px]",
              getPositionTypeClassName(position.type)
            )}
          >
            {position.type}
          </span>
          <span className="font-mono text-muted-foreground tabular-nums">
            {formatQuantity(position.size)}
          </span>
          <span className="font-mono tabular-nums">
            {formatCents(position.averageEntryPrice)}
          </span>
          <span className="font-mono tabular-nums">
            {formatCents(position.markPrice)}
          </span>
          <span className="font-mono tabular-nums">
            {position.currentValueUsd === null
              ? "--"
              : formatUsd(position.currentValueUsd)}
          </span>
          <span
            className={cn(
              "font-mono tabular-nums",
              getPnlClassName(position.unrealizedPnlUsd)
            )}
          >
            {position.unrealizedPnlUsd === null
              ? "--"
              : formatSignedUsd(position.unrealizedPnlUsd)}
          </span>
          <span className="truncate text-muted-foreground capitalize">
            {position.status}
          </span>
          <Button
            className="justify-self-end text-muted-foreground"
            render={<Link to={getMarketHref(position)} />}
            size="xs"
            type="button"
            variant="ghost"
          >
            Manage
            <ArrowUpRightIcon className="size-3" />
          </Button>
        </div>
      ))}
    </div>
  )
}

function PositionMarketCell({ position }: { position: PortfolioPosition }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-foreground">
        {position.contractLabel}
      </div>
      <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase">
        {formatExpiryDistance(position.expiryMs)} ·{" "}
        {formatRelativeTime(position.lastActivityAt)}
      </div>
    </div>
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
  positions,
}: {
  isLoading: boolean
  positions: PortfolioPosition[]
}) {
  if (isLoading) {
    return <LedgerEmptyState message="Loading portfolio positions." />
  }

  if (positions.length === 0) {
    return <LedgerEmptyState message="No positions in this view." />
  }

  return positions.map((position) => (
    <div className="rounded-md bg-muted/35 px-3 py-3" key={position.id}>
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
        </div>
        <Button
          render={<Link to={getMarketHref(position)} />}
          size="xs"
          type="button"
          variant="ghost"
        >
          Manage
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <MobileStat
          label="Entry"
          value={formatCents(position.averageEntryPrice)}
        />
        <MobileStat label="Mark" value={formatCents(position.markPrice)} />
        <MobileStat
          label="Value"
          value={
            position.currentValueUsd === null
              ? "--"
              : formatUsd(position.currentValueUsd)
          }
        />
        <MobileStat
          className={getPnlClassName(position.unrealizedPnlUsd)}
          label="PnL"
          value={
            position.unrealizedPnlUsd === null
              ? "--"
              : formatSignedUsd(position.unrealizedPnlUsd)
          }
        />
      </div>
      <div className="mt-3 font-mono text-[10px] text-muted-foreground uppercase">
        {position.status} · {formatRelativeTime(position.lastActivityAt)}
      </div>
    </div>
  ))
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
    <div>
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

function ActivityList({
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

  return (
    <div className="grid gap-0">
      {positions.map((position) => (
        <div
          className="flex items-center justify-between gap-4 border-b border-border/30 px-3 py-3 text-sm"
          key={position.id}
        >
          <div className="min-w-0">
            <div className="truncate text-foreground">
              {position.contractLabel}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Position updated · {formatRelativeTime(position.lastActivityAt)}
            </div>
          </div>
          <div className="shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
            {formatQuantity(position.size)} contracts
          </div>
        </div>
      ))}
    </div>
  )
}
