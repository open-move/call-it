import { DataRow } from "@/components/primitives/data-row"
import { formatDusdc, toQuoteAmount } from "@/lib/risk/helpers"
import type { RiskScenarioRow } from "@/lib/risk/types"
import type { VaultSummary } from "@/lib/types/predict"

export function LossWaterfall({
  scenario,
  summary,
}: {
  scenario: RiskScenarioRow
  summary: VaultSummary
}) {
  const nav = toQuoteAmount(summary.vault_value)
  const liability = scenario.estimatedLiability
  const stressed = scenario.estimatedVaultValue
  const retainedPct =
    nav > 0 ? Math.min(100, Math.max(0, (stressed / nav) * 100)) : 0
  const lostPct = Math.min(
    100 - retainedPct,
    nav > 0 ? Math.max(0, (liability / nav) * 100) : 0
  )

  return (
    <div>
      <div className="text-xs text-muted-foreground">
        How the loss is carved from NAV
      </div>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${retainedPct}%` }}
        />
        <div
          className="h-full bg-outcome-down transition-[width] duration-300"
          style={{ width: `${lostPct}%` }}
        />
      </div>
      <div className="mt-3">
        <DataRow label="Strategy NAV" value={formatDusdc(nav, 0)} />
        <DataRow
          label="Stress liability"
          tone="down"
          value={`− ${formatDusdc(liability, 0)}`}
        />
        <DataRow label="Stressed value" value={formatDusdc(stressed, 0)} />
      </div>
    </div>
  )
}
