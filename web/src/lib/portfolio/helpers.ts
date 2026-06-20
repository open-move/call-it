import type { PositionTableRow } from "@/components/shared/activity/position-table"
import { formatDecimalUnits } from "@/lib/amounts"
import {
  PREDICT_QUOTE_DECIMALS,
  PREDICT_QUOTE_ASSET,
  PREDICT_PRICE_SCALE as PRICE_SCALE,
  QUOTE_SCALE,
} from "@/lib/config"
import {
  formatExpiryDistance,
  formatRelativeTime,
  formatUsd,
} from "@/lib/format"
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
import type { PositionRow } from "@/lib/types/trade"
import type { ShieldPositionRow } from "@/services/shield-client"

export type PortfolioTab = "open" | "redeemable" | "closed" | "activity"
export type PositionType = "UP" | "DOWN" | "RNG"
export type ChartMode = "realized" | "exposure"
export type ChartInterval = "1d" | "1w" | "1m" | "max"
export type MarketSide = "up" | "down"

export interface MarketManageSearch {
  higherStrike?: number
  lowerStrike?: number
  side?: MarketSide
  strike: number
}

export type PortfolioMarketSearch =
  | {
      mode?: undefined
      side?: MarketSide
      strike: number
    }
  | {
      higherStrike?: number
      lowerStrike?: number
      mode: "range"
      strike: number
    }

export type TradingAccountModalMode = "deposit" | "withdraw"

export interface PortfolioPosition {
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

export interface PortfolioState {
  dusdcBalance: bigint
  errorMessage?: string
  isLoading: boolean
  managerId?: string
  managerSummary?: ManagerSummary
  plpBalance: bigint
  positions: PortfolioPosition[]
  realizedPnlPoints: RealizedPnlPoint[]
}

export interface PortfolioSummary {
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

export interface RealizedPnlEvent {
  contractLabel: string
  id: string
  pnlUsd: number
  timestampMs: number
}

export interface RealizedPnlPoint extends RealizedPnlEvent {
  cumulativePnlUsd: number
}

export interface RedeemState {
  errorMessage?: string
  positionId?: string
}

export type ExposureTone = "up" | "down" | "range"

export interface ExposureSegment {
  label: string
  tone: ExposureTone
  value: number
}

export const REALIZED_ACTIVITY_LIMIT = 2_000

export const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
})

export const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
})

export const axisTick = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
} as const

export const portfolioTabs = [
  { label: "Open", value: "open" },
  { label: "Redeemable", value: "redeemable" },
  { label: "Closed", value: "closed" },
  { label: "Activity", value: "activity" },
] satisfies Array<{ label: string; value: PortfolioTab }>

export const chartIntervals = [
  { label: "1d", value: "1d" },
  { label: "1w", value: "1w" },
  { label: "1m", value: "1m" },
  { label: "Max", value: "max" },
] satisfies Array<{ label: string; value: ChartInterval }>

export function toUsdPrice(value: number) {
  return value / PRICE_SCALE
}

export function toQuoteAmount(value: number) {
  return value / QUOTE_SCALE
}

export function coinBalanceToAmount(value: bigint) {
  return Number(value) / QUOTE_SCALE
}

export function getManagerDusdcBalance(summary: ManagerSummary | undefined) {
  return BigInt(
    Math.floor(
      summary?.balances.find(
        (balance) => balance.quote_asset === PREDICT_QUOTE_ASSET
      )?.balance ?? 0
    )
  )
}

export function getOracleById(oracles: OracleInfo[]) {
  return new Map(oracles.map((oracle) => [oracle.oracle_id, oracle]))
}

export function getAssetSymbol(
  oracleById: Map<string, OracleInfo>,
  oracleId: string
) {
  return oracleById.get(oracleId)?.underlying_asset ?? "Market"
}

export function getPositionTypeClassName(type: PositionType) {
  if (type === "UP") {
    return "text-outcome-up"
  }

  if (type === "DOWN") {
    return "text-outcome-down"
  }

  return "text-primary"
}

export function getPnlClassName(value: number | null) {
  if (value === null || value === 0) {
    return "text-muted-foreground"
  }

  return value > 0 ? "text-outcome-up" : "text-outcome-down"
}

export function findShieldReservation(
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

export function getReservedPositionIds(
  summaries: ManagerPositionSummary[],
  shieldPositions: ShieldPositionRow[]
): Set<string> {
  return new Set(
    summaries
      .filter((summary) => findShieldReservation(summary, shieldPositions))
      .map((summary) => {
        const side = summary.is_up ? "up" : "down"

        return `${summary.manager_id}:${summary.oracle_id}:${summary.strike}:${side}`
      })
  )
}

export function getPortfolioPositionFromRow({
  oracleById,
  position,
  reservedPositionIds,
}: {
  oracleById: Map<string, OracleInfo>
  position: PositionRow
  reservedPositionIds: Set<string>
}): PortfolioPosition {
  const assetSymbol = getAssetSymbol(oracleById, position.oracleId)

  if (position.kind === "directional") {
    const strikePriceUsd = position.strikePriceUsd
    const side: MarketSide = position.side === "above" ? "up" : "down"
    const type = position.side === "above" ? "UP" : "DOWN"

    return {
      assetSymbol,
      averageEntryPrice: position.averageEntryPrice,
      contractLabel: `${assetSymbol} ${formatUsd(strikePriceUsd, 0)} ${type}`,
      costBasisUsd: position.openCostBasisUsd,
      currentValueUsd: position.markValueUsd,
      expiryMs: position.expiryMs,
      id: position.id,
      lastActivityAt: position.lastActivityAt,
      manageSearch: { side, strike: strikePriceUsd },
      markPrice: position.markPrice,
      oracleId: position.oracleId,
      realizedPnlUsd: position.realizedPnlUsd,
      reservationLabel: reservedPositionIds.has(position.id)
        ? "Shield reserved"
        : undefined,
      size: position.openQuantity,
      status: position.status,
      type,
      unrealizedPnlUsd: position.unrealizedPnlUsd,
    }
  }

  return {
    assetSymbol,
    averageEntryPrice: position.averageEntryPrice,
    contractLabel: `${assetSymbol} ${formatUsd(position.lowerStrikePriceUsd, 0)}-${formatUsd(position.higherStrikePriceUsd, 0)} Range`,
    costBasisUsd: position.openCostBasisUsd,
    currentValueUsd: position.markValueUsd,
    expiryMs: position.expiryMs,
    id: position.id,
    lastActivityAt: position.lastActivityAt,
    manageSearch: {
      higherStrike: position.higherStrikePriceUsd,
      lowerStrike: position.lowerStrikePriceUsd,
      strike: position.lowerStrikePriceUsd,
    },
    markPrice: position.markPrice,
    oracleId: position.oracleId,
    realizedPnlUsd: position.realizedPnlUsd,
    size: position.openQuantity,
    status: position.status,
    type: "RNG",
    unrealizedPnlUsd: position.unrealizedPnlUsd,
  }
}

export function getPortfolioPositions({
  oracleById,
  positions,
  reservedPositionIds,
}: {
  oracleById: Map<string, OracleInfo>
  positions: PositionRow[]
  reservedPositionIds: Set<string>
}) {
  return positions
    .filter((position) => position.openQuantity > 0)
    .map((position) =>
      getPortfolioPositionFromRow({
        oracleById,
        position,
        reservedPositionIds,
      })
    )
    .sort(
      (firstPosition, secondPosition) =>
        secondPosition.lastActivityAt - firstPosition.lastActivityAt ||
        firstPosition.contractLabel.localeCompare(secondPosition.contractLabel)
    )
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

export function getRealizedPnlPoints(events: RealizedPnlEvent[]) {
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

export function getRealizedPnlChartData({
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

export function getPortfolioSummary({
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

export function getFilteredPositions({
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

export function canRedeemPortfolioPosition(position: PortfolioPosition) {
  if (!canLifecyclePortfolioPosition(position)) {
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

export function toOnchainPositionQuantity(quantity: number) {
  return BigInt(Math.round(quantity * QUOTE_SCALE))
}

export function getPortfolioRedeemParams({
  position,
  walletAddress,
}: {
  position: PortfolioPosition
  walletAddress: string
}) {
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
      kind: "range" as const,
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
    kind: "binary" as const,
    oracleId: position.oracleId,
    quantity,
    strikePriceUsd: position.manageSearch.strike,
    walletAddress,
  }
}

export function getTabCount(positions: PortfolioPosition[], tab: PortfolioTab) {
  return getFilteredPositions({ positions, searchQuery: "", tab }).length
}

export function getPositionLifecycleActionLabel(position: PortfolioPosition) {
  const status = position.status.toLowerCase()

  if (status === "redeemable") {
    return "Redeem position"
  }

  if (status === "lost" || status === "liquidated") {
    return "Clear position"
  }

  return "Close position"
}

export function canAddToPortfolioPosition(position: PortfolioPosition) {
  const status = position.status.toLowerCase()

  return status === "active" || status === "open"
}

export function canLifecyclePortfolioPosition(position: PortfolioPosition) {
  const status = position.status.toLowerCase()

  return (
    position.size > 0 &&
    (status === "active" ||
      status === "open" ||
      status === "redeemable" ||
      status === "lost" ||
      status === "liquidated")
  )
}

export function getPortfolioMarketSearch(
  position: PortfolioPosition
): PortfolioMarketSearch {
  if (position.type === "RNG") {
    return {
      higherStrike: position.manageSearch.higherStrike,
      lowerStrike: position.manageSearch.lowerStrike,
      mode: "range",
      strike: position.manageSearch.strike,
    }
  }

  return {
    side: position.manageSearch.side,
    strike: position.manageSearch.strike,
  }
}

export function getPortfolioPositionTone(position: PortfolioPosition) {
  if (position.type === "UP") {
    return "up" as const
  }

  if (position.type === "DOWN") {
    return "down" as const
  }

  return "range" as const
}

export function getRealizedPnlDomain(points: RealizedPnlPoint[]) {
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

export function getRealizedPnlTicks(domain: [number, number]) {
  const [min, max] = domain
  const range = max - min

  if (range <= 0) {
    return [min]
  }

  return Array.from({ length: 5 }, (_, index) => min + (range * index) / 4)
}

export function getDisplayRealizedPnlPoints(points: RealizedPnlPoint[]) {
  if (points.length === 0) {
    return []
  }

  const [firstPoint] = points

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

export function getIntervalStartMs(
  interval: ChartInterval,
  nowMs = Date.now()
) {
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

export function getIntervalRealizedPnlPoints(
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

export function getExposureTextClassName(tone: ExposureTone) {
  if (tone === "up") {
    return "text-outcome-up"
  }

  if (tone === "down") {
    return "text-outcome-down"
  }

  return "text-primary"
}

export function getExposureBgClassName(tone: ExposureTone) {
  if (tone === "up") {
    return "bg-outcome-up"
  }

  if (tone === "down") {
    return "bg-outcome-down"
  }

  return "bg-primary"
}
