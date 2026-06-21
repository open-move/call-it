import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  MoveHorizontalIcon,
} from "lucide-react"

import { formatDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS, QUOTE_SCALE } from "@/lib/config"
import { formatUsd } from "@/lib/format"
import { loadManagerPredictPositions } from "@/lib/predict-position-source"
import type { MarketSnapshot } from "@/lib/types/market"
import type {
  PositionRow,
  RedemptionActivityRow,
  TradeActivityRow,
} from "@/lib/types/trade"
import type {
  PredictRedeemParams,
  PredictTradeParams,
} from "@/services/predict-transactions"
import type { ShieldPositionRow } from "@/services/shield-client"

import type {
  AddPositionIntent,
  ContractSide,
  ContractTone,
  ContractToneInput,
  LoadedPositions,
  RangeStrikeState,
  TicketMode,
} from "./types"

export function addressMatches(firstAddress: string, secondAddress: string) {
  return firstAddress.toLowerCase() === secondAddress.toLowerCase()
}

export function formatPriceCents(price: number) {
  return `${(price * 100).toFixed(1)}c`
}

export function formatQuantity(quantity: number) {
  return quantity.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })
}

export function formatPositionQuantity(quantity: number) {
  return quantity.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  })
}

export function toOnchainPositionQuantity(quantity: number) {
  return BigInt(Math.round(quantity * QUOTE_SCALE))
}

export function formatCompactDusdc(value: number) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
    minimumFractionDigits: value >= 100 ? 0 : 2,
  })} DUSDC`
}

export function formatRange(
  lowerStrikePriceUsd: number,
  higherStrikePriceUsd: number
) {
  return `${formatUsd(lowerStrikePriceUsd, 0)}-${formatUsd(higherStrikePriceUsd, 0)}`
}

export function getSideLabel(side: "above" | "below") {
  return side === "above" ? "Above" : "Below"
}

export function getPositionContract(
  position: PositionRow,
  assetSymbol: string
) {
  return position.kind === "directional"
    ? `${assetSymbol} ${formatUsd(position.strikePriceUsd, 0)} ${getSideLabel(position.side)}`
    : `${assetSymbol} ${formatRange(position.lowerStrikePriceUsd, position.higherStrikePriceUsd)} Range`
}

export function getPositionKindLabel(position: PositionRow) {
  return position.kind === "range" ? "RNG" : getSideLabel(position.side)
}

export function getContractTone(row: ContractToneInput): ContractTone {
  return row.kind === "range"
    ? "range"
    : row.side === "above"
      ? "above"
      : "below"
}

export function getContractTextClass(row: ContractToneInput) {
  const tone = getContractTone(row)

  if (tone === "range") {
    return "text-primary"
  }

  return tone === "above" ? "text-outcome-up" : "text-outcome-down"
}

export function getContractKindLabel(row: ContractToneInput) {
  return row.kind === "range" ? "RNG" : getSideLabel(row.side ?? "below")
}

export function getMarketOracleInfo(market: MarketSnapshot) {
  return new Map([
    [
      market.oracleId,
      {
        activated_at: null,
        created_checkpoint: 0,
        expiry: market.expiryMs,
        min_strike: 0,
        oracle_cap_id: "",
        oracle_id: market.oracleId,
        predict_id: "",
        settled_at: market.settledAtMs,
        settlement_price: market.settlementPrice,
        status: market.status,
        tick_size: 0,
        underlying_asset: market.assetSymbol,
      },
    ],
  ])
}

export function getPositionLifecycleActionLabel(position: PositionRow) {
  const status = position.status.toLowerCase()

  if (status === "redeemable") {
    return "Redeem position"
  }

  if (status === "lost" || status === "liquidated") {
    return "Clear position"
  }

  return "Close position"
}

export function getPositionRedeemParams({
  market,
  position,
  walletAddress,
}: {
  market: MarketSnapshot
  position: PositionRow
  walletAddress: string
}): PredictRedeemParams | undefined {
  const quantity = toOnchainPositionQuantity(position.openQuantity)

  if (quantity <= 0n) {
    return undefined
  }

  return position.kind === "directional"
    ? {
        expiryMs: market.expiryMs,
        isUp: position.side === "above",
        kind: "binary",
        oracleId: market.oracleId,
        quantity,
        strikePriceUsd: position.strikePriceUsd,
        walletAddress,
      }
    : {
        expiryMs: market.expiryMs,
        higherStrikePriceUsd: position.higherStrikePriceUsd,
        kind: "range",
        lowerStrikePriceUsd: position.lowerStrikePriceUsd,
        oracleId: market.oracleId,
        quantity,
        walletAddress,
      }
}

export function getPositionAddIntent(position: PositionRow): AddPositionIntent {
  return position.kind === "directional"
    ? {
        kind: "binary",
        side: position.side,
        strikePriceUsd: position.strikePriceUsd,
      }
    : {
        higherStrikePriceUsd: position.higherStrikePriceUsd,
        kind: "range",
        lowerStrikePriceUsd: position.lowerStrikePriceUsd,
      }
}

export function canAddToPosition(position: PositionRow) {
  const status = position.status.toLowerCase()

  return status === "active" || status === "open"
}

export function canClosePosition(position: PositionRow) {
  return canAddToPosition(position)
}

export function canRedeemPosition(position: PositionRow) {
  return position.status.toLowerCase() === "redeemable"
}

export function canClearPosition(position: PositionRow) {
  const status = position.status.toLowerCase()

  return status === "lost" || status === "liquidated"
}

export async function loadWalletMarketPositions({
  managerId,
  market,
}: {
  managerId?: string
  market: MarketSnapshot
}): Promise<LoadedPositions> {
  if (!managerId) {
    return { positions: [] }
  }

  const loadedPositions = await loadManagerPredictPositions({
    filter: {
      expiryMs: market.expiryMs,
      oracleId: market.oracleId,
    },
    managerId,
    oracleById: getMarketOracleInfo(market),
  })

  return {
    managerId,
    positions: loadedPositions.rows,
  }
}

export function getTradeContract(trade: {
  side: "above" | "below"
  strikePriceUsd: number
}) {
  return `${formatUsd(trade.strikePriceUsd, 0)} ${getSideLabel(trade.side)}`
}

export function getActivityTradeContract(
  trade: TradeActivityRow,
  assetSymbol: string
) {
  return trade.kind === "directional"
    ? `${assetSymbol} ${getTradeContract(trade)}`
    : `${assetSymbol} ${formatRange(trade.lowerStrikePriceUsd, trade.higherStrikePriceUsd)} Range`
}

export function isWalletTrade(trade: TradeActivityRow, walletAddress: string) {
  return addressMatches(trade.trader, walletAddress)
}

export function getRedemptionContract(
  redemption: RedemptionActivityRow,
  assetSymbol: string
) {
  return redemption.kind === "directional"
    ? `${assetSymbol} ${formatUsd(redemption.strikePriceUsd, 0)} ${getSideLabel(redemption.side)}`
    : `${assetSymbol} ${formatRange(redemption.lowerStrikePriceUsd, redemption.higherStrikePriceUsd)} Range`
}

export function getRedemptionOwner(redemption: RedemptionActivityRow) {
  return redemption.kind === "directional"
    ? redemption.owner
    : redemption.trader
}

export function isWalletRedemption(
  redemption: RedemptionActivityRow,
  walletAddress: string
) {
  return addressMatches(getRedemptionOwner(redemption), walletAddress)
}

export function getModeLabel(mode: TicketMode) {
  return mode === "binary" ? "Binary" : "Range"
}

export function getModeIcon(mode: TicketMode) {
  return mode === "binary" ? ArrowUpDownIcon : MoveHorizontalIcon
}

export function getSideIcon(side: ContractSide) {
  return side === "above" ? ArrowUpIcon : ArrowDownIcon
}

export function isTicketMode(value: unknown): value is TicketMode {
  return value === "binary" || value === "range"
}

export function formatStrikeValue(value: number, tickSizeUsd: number) {
  return formatUsd(value, tickSizeUsd < 1 ? 2 : 0)
}

export function formatStrikeInput(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

export function parseStrikeInput(value: string) {
  const normalizedValue = value.replaceAll(",", "").replace("$", "").trim()

  if (!normalizedValue) {
    return undefined
  }

  const parsedValue = Number(normalizedValue)

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : undefined
}

export function normalizeStrikePrice(value: number, market: MarketSnapshot) {
  const tickSizeUsd = market.tickSizeUsd > 0 ? market.tickSizeUsd : 1
  const minStrikeUsd = Math.max(market.minStrikeUsd, tickSizeUsd)
  const roundedValue = Math.round(value / tickSizeUsd) * tickSizeUsd
  const normalizedValue = Math.max(roundedValue, minStrikeUsd)

  return Number(normalizedValue.toFixed(8))
}

export function getRangeStrikeDefaults(
  market: MarketSnapshot,
  selectedStrikePriceUsd: number
) {
  const tickSizeUsd = market.tickSizeUsd > 0 ? market.tickSizeUsd : 1
  const rangeWidthUsd = tickSizeUsd * 5

  return {
    higher: normalizeStrikePrice(
      selectedStrikePriceUsd + rangeWidthUsd,
      market
    ),
    lower: normalizeStrikePrice(selectedStrikePriceUsd - rangeWidthUsd, market),
  }
}

export function formatStrikeSearchParam(strikePriceUsd: number) {
  return strikePriceUsd.toString()
}

export function pinStrikeSearchParam(strikePriceUsd: number) {
  const url = new URL(window.location.href)
  const strikeParam = formatStrikeSearchParam(strikePriceUsd)

  if (url.searchParams.get("strike") === strikeParam) {
    return
  }

  url.searchParams.set("strike", strikeParam)
  window.history.replaceState(window.history.state, "", url)
}

export function formatDusdc(value: bigint) {
  return `${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)} DUSDC`
}

export function getTradeReserveAmount(value: bigint) {
  return (value * 11_000n + 9_999n) / 10_000n
}

export function getMarketUnavailableMessage(
  market: MarketSnapshot,
  nowMs: number
) {
  if (nowMs >= market.expiryMs) {
    return "This market has expired and is waiting for settlement. Choose a later expiry."
  }

  if (market.status !== "active") {
    return "This market is not active. Choose an active expiry."
  }

  return undefined
}

export function isSameShieldKey({
  contractSide,
  market,
  position,
  strikePriceUsd,
}: {
  contractSide: ContractSide
  market: MarketSnapshot
  position: ShieldPositionRow
  strikePriceUsd: number
}) {
  return (
    position.oracleId === market.oracleId &&
    position.hedgeExpiryMs === market.expiryMs &&
    position.isUp === (contractSide === "above") &&
    Math.abs(position.hedgeStrikeUsd - strikePriceUsd) < 0.000001
  )
}

export function getTradeParams({
  contractSide,
  market,
  quantity,
  rangeStrikes,
  selectedStrikePriceUsd,
  ticketMode,
  walletAddress,
}: {
  contractSide: ContractSide
  market: MarketSnapshot
  quantity: bigint
  rangeStrikes: RangeStrikeState
  selectedStrikePriceUsd: number
  ticketMode: TicketMode
  walletAddress: string
}): PredictTradeParams {
  if (ticketMode === "range") {
    return {
      expiryMs: market.expiryMs,
      higherStrikePriceUsd: rangeStrikes.higher,
      kind: "range",
      lowerStrikePriceUsd: rangeStrikes.lower,
      oracleId: market.oracleId,
      quantity,
      walletAddress,
    }
  }

  return {
    expiryMs: market.expiryMs,
    isUp: contractSide === "above",
    oracleId: market.oracleId,
    quantity,
    strikePriceUsd: selectedStrikePriceUsd,
    walletAddress,
  }
}
