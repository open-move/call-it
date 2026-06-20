import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatQuoteAmount, formatPercent } from "@/lib/earn/format"
import type {
  VaultPerformanceResponse,
  VaultSummary,
} from "@/lib/types/predict"
import { VaultPriceChart } from "./price-chart"

export function VaultStatsCard({
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
          Liquidity Strategy Overview
        </CardTitle>
        <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
          Deposit DUSDC to mint PLP shares that back Predict market liquidity.
          Withdrawals redeem PLP against available strategy liquidity.
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-4 pt-2 pb-4">
        <div className="space-y-2.5">
          <VaultStatRow
            label="Strategy NAV"
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
        </div>

        <VaultPriceChart performance={performance} summary={summary} />
      </CardContent>
    </Card>
  )
}

export function VaultStatRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
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
