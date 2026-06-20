import { QUOTE_SCALE } from "@/lib/config"
import { buildRiskReport } from "@/lib/risk/calculations"
import type {
  RiskExposureRow,
  RiskModel,
  RiskScenarioGroup,
  RiskScenarioRow,
  RiskScenarioTone,
} from "@/lib/risk/types"
import { formatPercent } from "@/lib/format"

export type ChartMetric = "drawdown" | "liability" | "plpPrice" | "vaultValue"
export type ExposureFilter = "all" | "directional" | "range"

export const exposurePageSize = 12

export const scenarioGroups = [
  { id: "core", label: "Core" },
  { id: "downside", label: "Downside" },
  { id: "upside", label: "Upside" },
  { id: "stress", label: "Stress" },
] satisfies { id: RiskScenarioGroup; label: string }[]

export const chartMetrics = [
  { id: "drawdown", label: "Drawdown" },
  { id: "liability", label: "Liability" },
  { id: "plpPrice", label: "PLP Price" },
  { id: "vaultValue", label: "Strategy Value" },
] satisfies { id: ChartMetric; label: string }[]

export const sharePriceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
  minimumFractionDigits: 6,
})

export const compactPercentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  style: "percent",
})

export function toQuoteAmount(value: number) {
  return value / QUOTE_SCALE
}

export function formatTokenAmount(
  value: number,
  symbol: string,
  maximumFractionDigits = 4
) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })} ${symbol}`
}

export function formatQuoteAmount(value: number, symbol = "DUSDC") {
  return formatTokenAmount(toQuoteAmount(value), symbol)
}

export function formatDusdc(value: number, maximumFractionDigits = 2) {
  return formatTokenAmount(value, "DUSDC", maximumFractionDigits)
}

export function formatSharePrice(value: number) {
  return `${sharePriceFormatter.format(value)} DUSDC`
}

export function getDrawdownClassName(value: number) {
  if (value <= 0) {
    return "text-muted-foreground"
  }

  return value >= 0.12 ? "text-outcome-down" : "text-chart-4"
}

export function getScenarioAccentClassName(tone: RiskScenarioTone) {
  switch (tone) {
    case "down":
      return "text-outcome-down"
    case "up":
      return "text-outcome-up"
    case "warning":
      return "text-chart-4"
    case "muted":
      return "text-muted-foreground"
  }
}

export function getWorstScenario(rows: RiskScenarioRow[]) {
  return rows.reduce((worstRow, row) =>
    row.drawdownPct > worstRow.drawdownPct ? row : worstRow
  )
}

export function getSeverityPercent(row: RiskScenarioRow) {
  return Math.min(Math.max(row.drawdownPct / 0.4, 0), 1) * 100
}

export function getExposureSummary(rows: RiskExposureRow[]) {
  const directionalMaxPayout = rows
    .filter((row) => row.kind === "directional")
    .reduce((total, row) => total + row.maxPayoutUsd, 0)
  const rangeMaxPayout = rows
    .filter((row) => row.kind === "range")
    .reduce((total, row) => total + row.maxPayoutUsd, 0)
  const largestExposure = rows.reduce<RiskExposureRow | undefined>(
    (largestRow, row) =>
      !largestRow || row.maxPayoutUsd > largestRow.maxPayoutUsd
        ? row
        : largestRow,
    undefined
  )

  return {
    directionalMaxPayout,
    largestExposure,
    rangeMaxPayout,
    totalMaxPayout: directionalMaxPayout + rangeMaxPayout,
  }
}

export function getChartValue(row: RiskScenarioRow, metric: ChartMetric) {
  switch (metric) {
    case "drawdown":
      return row.drawdownPct
    case "liability":
      return row.estimatedLiability
    case "plpPrice":
      return row.estimatedSharePrice
    case "vaultValue":
      return row.estimatedVaultValue
  }
}

export function formatChartTick(value: number, metric: ChartMetric) {
  switch (metric) {
    case "drawdown":
      return compactPercentFormatter.format(value)
    case "liability":
    case "vaultValue":
      return value >= 1_000 ? `${Math.round(value / 1_000)}k` : value.toFixed(0)
    case "plpPrice":
      return value.toFixed(4)
  }
}

export function exportRiskReport(model: RiskModel) {
  const report = buildRiskReport(model)
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = `callit-plp-risk-report-${report.generatedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
