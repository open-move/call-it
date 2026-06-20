import { SUI_NETWORK } from "@/lib/config"
import { buildLeaderboardReport } from "@/lib/leaderboard/calculations"
import type {
  LeaderboardModel,
  LeaderboardPeriod,
} from "@/lib/leaderboard/types"

export const leaderboardPeriodOptions = [
  { id: "today", label: "Today", meta: "24h" },
  { id: "weekly", label: "Weekly", meta: "7d" },
  { id: "monthly", label: "Monthly", meta: "30d" },
  { id: "allTime", label: "All time", meta: "Full" },
] satisfies { id: LeaderboardPeriod; label: string; meta: string }[]

export function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function getAccountUrl(account: string) {
  return `https://suiscan.xyz/${SUI_NETWORK}/account/${account}`
}

export function formatDusdc(value: number, maximumFractionDigits = 2) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })} DUSDC`
}

export function formatSignedDusdc(value: number, maximumFractionDigits = 2) {
  if (value > 0) {
    return `+${formatDusdc(value, maximumFractionDigits)}`
  }

  if (value < 0) {
    return `-${formatDusdc(Math.abs(value), maximumFractionDigits)}`
  }

  return formatDusdc(0, maximumFractionDigits)
}

export function formatOptionalPercent(value: number | null) {
  return value === null ? "--" : `${(value * 100).toFixed(1)}%`
}

export function getPnlClassName(value: number) {
  if (value === 0) {
    return "text-muted-foreground"
  }

  return value > 0 ? "text-outcome-up" : "text-outcome-down"
}

export function getPeriodLabel(period: LeaderboardPeriod) {
  return (
    leaderboardPeriodOptions.find((option) => option.id === period)?.label ??
    "All time"
  )
}

export function exportLeaderboardReport(
  model: LeaderboardModel,
  period: LeaderboardPeriod
) {
  const report = buildLeaderboardReport(model)
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const periodSlug = period.replace(
    /[A-Z]/g,
    (match) => `-${match.toLowerCase()}`
  )

  link.href = url
  link.download = `callit-predict-leaderboard-${periodSlug}-${report.generatedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
