import { QUOTE_SCALE } from "@/lib/config"
import type {
  DirectionalPositionMintEvent,
  DirectionalPositionRedeemEvent,
  RangeMintEvent,
  RangeRedeemEvent,
} from "@/lib/types/predict"

import type {
  LeaderboardAccountRow,
  LeaderboardInput,
  LeaderboardModel,
  LeaderboardReport,
  LeaderboardTotals,
} from "./types"

interface AccountAccumulator {
  account: string
  activityCount: number
  directionalCount: number
  lastActivityAtMs: number
  rangeCount: number
  volume: number
}

interface AccountPositionAccumulator {
  account: string
  cost: number
  payout: number
  quantityMinted: number
  quantityRedeemed: number
}

interface AccountSettlementSummary {
  openCostBasis: number
  realizedPayout: number
  realizedPnl: number
  redeemedCostBasis: number
  settledCount: number
  wins: number
}

function toQuoteAmount(value: number) {
  return value / QUOTE_SCALE
}

function getDirectionalPositionKey(
  event: DirectionalPositionMintEvent | DirectionalPositionRedeemEvent
) {
  return `${event.manager_id}:${event.oracle_id}:${event.expiry}:${event.strike}:${event.is_up}`
}

function getRangePositionKey(event: RangeMintEvent | RangeRedeemEvent) {
  return `${event.manager_id}:${event.oracle_id}:${event.expiry}:${event.lower_strike}:${event.higher_strike}`
}

function getAccountPositionKey(account: string, positionKey: string) {
  return `${account}:${positionKey}`
}

function getAccount(
  accounts: Map<string, AccountAccumulator>,
  account: string
) {
  const currentAccount = accounts.get(account)

  if (currentAccount) {
    return currentAccount
  }

  const nextAccount = {
    account,
    activityCount: 0,
    directionalCount: 0,
    lastActivityAtMs: 0,
    rangeCount: 0,
    volume: 0,
  }

  accounts.set(account, nextAccount)
  return nextAccount
}

function getAccountPosition(
  positions: Map<string, AccountPositionAccumulator>,
  account: string,
  positionKey: string
) {
  const key = getAccountPositionKey(account, positionKey)
  const currentPosition = positions.get(key)

  if (currentPosition) {
    return currentPosition
  }

  const nextPosition = {
    account,
    cost: 0,
    payout: 0,
    quantityMinted: 0,
    quantityRedeemed: 0,
  }

  positions.set(key, nextPosition)
  return nextPosition
}

function addMint({
  account,
  accounts,
  cost,
  isRange,
  positionKey,
  positions,
  quantity,
  timestampMs,
}: {
  account: string
  accounts: Map<string, AccountAccumulator>
  cost: number
  isRange: boolean
  positionKey: string
  positions: Map<string, AccountPositionAccumulator>
  quantity: number
  timestampMs: number
}) {
  const accountStats = getAccount(accounts, account)
  const position = getAccountPosition(positions, account, positionKey)

  accountStats.activityCount += 1
  accountStats.lastActivityAtMs = Math.max(
    accountStats.lastActivityAtMs,
    timestampMs
  )
  accountStats.volume += cost

  if (isRange) {
    accountStats.rangeCount += 1
  } else {
    accountStats.directionalCount += 1
  }

  position.cost += cost
  position.quantityMinted += quantity
}

function addRedeem({
  account,
  accounts,
  isRange,
  payout,
  positionKey,
  positions,
  quantity,
  timestampMs,
}: {
  account: string
  accounts: Map<string, AccountAccumulator>
  isRange: boolean
  payout: number
  positionKey: string
  positions: Map<string, AccountPositionAccumulator>
  quantity: number
  timestampMs: number
}) {
  const accountStats = getAccount(accounts, account)
  const position = getAccountPosition(positions, account, positionKey)

  accountStats.activityCount += 1
  accountStats.lastActivityAtMs = Math.max(
    accountStats.lastActivityAtMs,
    timestampMs
  )

  if (isRange) {
    accountStats.rangeCount += 1
  } else {
    accountStats.directionalCount += 1
  }

  position.payout += payout
  position.quantityRedeemed += quantity
}

function getSettlementSummaries(
  positions: Map<string, AccountPositionAccumulator>
) {
  const summaries = new Map<string, AccountSettlementSummary>()

  for (const position of positions.values()) {
    const currentSummary = summaries.get(position.account) ?? {
      openCostBasis: 0,
      realizedPayout: 0,
      realizedPnl: 0,
      redeemedCostBasis: 0,
      settledCount: 0,
      wins: 0,
    }
    const averageCost =
      position.quantityMinted > 0 ? position.cost / position.quantityMinted : 0
    const redeemedCostBasis = averageCost * position.quantityRedeemed
    const openQuantity = Math.max(
      position.quantityMinted - position.quantityRedeemed,
      0
    )
    const realizedPnl = position.payout - redeemedCostBasis

    currentSummary.openCostBasis += averageCost * openQuantity
    currentSummary.realizedPayout += position.payout
    currentSummary.redeemedCostBasis += redeemedCostBasis
    currentSummary.realizedPnl += realizedPnl

    if (position.quantityRedeemed > 0) {
      currentSummary.settledCount += 1

      if (realizedPnl > 0) {
        currentSummary.wins += 1
      }
    }

    summaries.set(position.account, currentSummary)
  }

  return summaries
}

function getTotals(rows: LeaderboardAccountRow[]): LeaderboardTotals {
  return rows.reduce(
    (totals, row) => ({
      accounts: totals.accounts + 1,
      activityCount: totals.activityCount + row.activityCount,
      openCostBasisUsd: totals.openCostBasisUsd + row.openCostBasisUsd,
      realizedPnlUsd: totals.realizedPnlUsd + row.realizedPnlUsd,
      volumeUsd: totals.volumeUsd + row.volumeUsd,
    }),
    {
      accounts: 0,
      activityCount: 0,
      openCostBasisUsd: 0,
      realizedPnlUsd: 0,
      volumeUsd: 0,
    }
  )
}

export function buildLeaderboardModel(
  input: LeaderboardInput
): LeaderboardModel {
  const accounts = new Map<string, AccountAccumulator>()
  const positions = new Map<string, AccountPositionAccumulator>()

  for (const event of input.directionalMints) {
    addMint({
      account: event.trader,
      accounts,
      cost: event.cost,
      isRange: false,
      positionKey: getDirectionalPositionKey(event),
      positions,
      quantity: event.quantity,
      timestampMs: event.checkpoint_timestamp_ms,
    })
  }

  for (const event of input.rangeMints) {
    addMint({
      account: event.trader,
      accounts,
      cost: event.cost,
      isRange: true,
      positionKey: getRangePositionKey(event),
      positions,
      quantity: event.quantity,
      timestampMs: event.checkpoint_timestamp_ms,
    })
  }

  for (const event of input.directionalRedeems) {
    addRedeem({
      account: event.owner,
      accounts,
      isRange: false,
      payout: event.payout,
      positionKey: getDirectionalPositionKey(event),
      positions,
      quantity: event.quantity,
      timestampMs: event.checkpoint_timestamp_ms,
    })
  }

  for (const event of input.rangeRedeems) {
    addRedeem({
      account: event.trader,
      accounts,
      isRange: true,
      payout: event.payout,
      positionKey: getRangePositionKey(event),
      positions,
      quantity: event.quantity,
      timestampMs: event.checkpoint_timestamp_ms,
    })
  }

  const settlementSummaries = getSettlementSummaries(positions)
  const rows = Array.from(accounts.values())
    .map((accountStats) => {
      const settlementSummary = settlementSummaries.get(
        accountStats.account
      ) ?? {
        openCostBasis: 0,
        realizedPayout: 0,
        realizedPnl: 0,
        redeemedCostBasis: 0,
        settledCount: 0,
        wins: 0,
      }
      const realizedPnlPct =
        settlementSummary.redeemedCostBasis > 0
          ? settlementSummary.realizedPnl / settlementSummary.redeemedCostBasis
          : null
      const winRate =
        settlementSummary.settledCount > 0
          ? settlementSummary.wins / settlementSummary.settledCount
          : null

      return {
        account: accountStats.account,
        activityCount: accountStats.activityCount,
        directionalCount: accountStats.directionalCount,
        lastActivityAtMs: accountStats.lastActivityAtMs,
        openCostBasisUsd: toQuoteAmount(settlementSummary.openCostBasis),
        rank: 0,
        rangeCount: accountStats.rangeCount,
        realizedPayoutUsd: toQuoteAmount(settlementSummary.realizedPayout),
        realizedPnlPct,
        realizedPnlUsd: toQuoteAmount(settlementSummary.realizedPnl),
        redeemedCostBasisUsd: toQuoteAmount(
          settlementSummary.redeemedCostBasis
        ),
        settledCount: settlementSummary.settledCount,
        volumeUsd: toQuoteAmount(accountStats.volume),
        winRate,
        wins: settlementSummary.wins,
      } satisfies LeaderboardAccountRow
    })
    .sort(
      (firstAccount, secondAccount) =>
        secondAccount.realizedPnlUsd - firstAccount.realizedPnlUsd ||
        secondAccount.volumeUsd - firstAccount.volumeUsd ||
        secondAccount.activityCount - firstAccount.activityCount ||
        firstAccount.account.localeCompare(secondAccount.account)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }))

  return {
    assumptions: [
      "Leaderboard rows are estimated from public Predict mint, redeem, and range events.",
      "Realized PnL uses proportional cost basis from reconstructed event history and is not protocol-authoritative accounting.",
      "Open cost basis reflects unredeemed quantities visible within the fetched event window.",
      "Rank is sorted by estimated realized PnL, then volume, then activity count.",
    ],
    generatedAtMs: Date.now(),
    rows,
    totals: getTotals(rows),
  }
}

export function buildLeaderboardReport(
  model: LeaderboardModel
): LeaderboardReport {
  return {
    assumptions: model.assumptions,
    generatedAt: new Date(model.generatedAtMs).toISOString(),
    rows: model.rows,
    totals: model.totals,
  }
}
