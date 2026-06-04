import { formatRelativeTime, formatUsd } from "~/lib/callit/format"
import {
  type PortfolioActivityItem,
  type PortfolioPageData,
  type PortfolioPosition,
  PortfolioPositionKind,
  PortfolioPositionStatus,
} from "~/lib/callit/portfolio/types"
import {
  getManagerPositionSummaries,
  getManagerSummary,
  getPredictManagers,
} from "~/lib/deepbook/predict-client"
import {
  type ManagerPositionSummaryResponse,
  type PredictManagerEvent,
} from "~/lib/deepbook/predict-types"

const PRICE_SCALE = 1_000_000_000
const QUOTE_SCALE = 1_000_000

function toQuoteUsd(value: number) {
  return value / QUOTE_SCALE
}

function toStrikeUsd(value: number) {
  return value / PRICE_SCALE
}

function formatUtcExpiry(timestampMs: number) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(timestampMs))
}

function getLatestManager(
  managers: PredictManagerEvent[],
  walletAddress: string
): PredictManagerEvent | null {
  const normalizedWalletAddress = walletAddress.toLowerCase()

  return managers
    .filter((manager) => manager.owner.toLowerCase() === normalizedWalletAddress)
    .sort((firstManager, secondManager) => {
      if (
        secondManager.checkpoint_timestamp_ms !==
        firstManager.checkpoint_timestamp_ms
      ) {
        return (
          secondManager.checkpoint_timestamp_ms -
          firstManager.checkpoint_timestamp_ms
        )
      }

      return secondManager.checkpoint - firstManager.checkpoint
    })[0] ?? null
}

function getPositionStatus(
  position: ManagerPositionSummaryResponse
): PortfolioPositionStatus {
  if (position.open_quantity > 0) {
    return PortfolioPositionStatus.Active
  }

  if (position.status === "redeemable") {
    return PortfolioPositionStatus.Redeemable
  }

  return PortfolioPositionStatus.Settled
}

function getSettlementLabel(position: ManagerPositionSummaryResponse) {
  const strike = formatUsd(toStrikeUsd(position.strike), 0)

  if (position.status === "redeemed") {
    return "Claim completed"
  }

  if (position.status === "lost") {
    return `${position.is_up ? "Above" : "Below"} ${strike} thesis expired out of the money`
  }

  return `${position.is_up ? "Settles above" : "Settles below"} ${strike}`
}

function getValueLabel(position: ManagerPositionSummaryResponse) {
  const status = getPositionStatus(position)

  if (status === PortfolioPositionStatus.Active) {
    return `At risk ${formatUsd(toQuoteUsd(position.open_cost_basis))}`
  }

  if (status === PortfolioPositionStatus.Redeemable) {
    return `Claimable ${formatUsd(toQuoteUsd(position.total_payout))}`
  }

  return `Payout ${formatUsd(toQuoteUsd(position.total_payout))}`
}

function getPnlLabel(position: ManagerPositionSummaryResponse) {
  const status = getPositionStatus(position)

  if (status === PortfolioPositionStatus.Active) {
    return `${position.unrealized_pnl >= 0 ? "+" : ""}${formatUsd(toQuoteUsd(position.unrealized_pnl))} unrealized`
  }

  return `${position.realized_pnl >= 0 ? "+" : ""}${formatUsd(toQuoteUsd(position.realized_pnl))} realized`
}

function mapPosition(
  position: ManagerPositionSummaryResponse
): PortfolioPosition {
  const strikeLabel = formatUsd(toStrikeUsd(position.strike), 0)

  return {
    id: `${position.oracle_id}-${position.strike}-${position.is_up ? "up" : "down"}`,
    assetSymbol: position.underlying_asset,
    entryPriceLabel: `${strikeLabel} strike`,
    expiryLabel: `${formatUtcExpiry(position.expiry)} UTC`,
    kind: PortfolioPositionKind.Binary,
    outcomeLabel: `${position.underlying_asset} ${position.is_up ? "Up" : "Down"}`,
    pnlLabel: getPnlLabel(position),
    quantityLabel: `Cost ${formatUsd(toQuoteUsd(position.total_cost))}`,
    settlementLabel: getSettlementLabel(position),
    status: getPositionStatus(position),
    valueLabel: getValueLabel(position),
  }
}

function mapActivity(
  positions: ManagerPositionSummaryResponse[]
): PortfolioActivityItem[] {
  return positions
    .slice()
    .sort(
      (firstPosition, secondPosition) =>
        secondPosition.last_activity_at - firstPosition.last_activity_at
    )
    .slice(0, 8)
    .map((position) => ({
      id: `${position.oracle_id}-${position.last_activity_at}`,
      actionLabel:
        position.open_quantity > 0 ? "Position opened" : "Position updated",
      amountLabel:
        position.open_quantity > 0
          ? `-${formatUsd(toQuoteUsd(position.total_cost))}`
          : `${position.total_payout > 0 ? "+" : ""}${formatUsd(
              toQuoteUsd(position.total_payout)
            )}`,
      assetSymbol: position.underlying_asset,
      detailLabel: `${position.is_up ? "Up" : "Down"} at ${formatUsd(
        toStrikeUsd(position.strike),
        0
      )}`,
      timeLabel: formatRelativeTime(position.last_activity_at),
    }))
}

export async function loadPortfolioPageDataForWallet(
  walletAddress: string
): Promise<PortfolioPageData | null> {
  const managers = await getPredictManagers()
  const latestManager = getLatestManager(managers, walletAddress)

  if (!latestManager) {
    return null
  }

  const [summary, positions] = await Promise.all([
    getManagerSummary(latestManager.manager_id),
    getManagerPositionSummaries(latestManager.manager_id),
  ])

  return {
    summary: {
      activePositions: summary.open_positions,
      claimableAmountUsd: toQuoteUsd(summary.redeemable_value),
      managerBalanceUsd: toQuoteUsd(summary.trading_balance),
      realizedPnlUsd: toQuoteUsd(summary.realized_pnl),
    },
    positions: positions.map(mapPosition),
    activity: mapActivity(positions),
  }
}
