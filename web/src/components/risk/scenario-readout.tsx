import { DataRow } from "@/components/primitives/data-row"
import { formatUsd } from "@/lib/format"
import { formatSharePrice } from "@/lib/risk/helpers"
import type { RiskScenarioRow } from "@/lib/risk/types"
import type { VaultSummary } from "@/lib/types/predict"
import { LossWaterfall } from "./loss-waterfall"

export function ScenarioReadout({
  scenario,
  summary,
}: {
  scenario: RiskScenarioRow
  summary: VaultSummary
}) {
  return (
    <div className="space-y-4">
      <LossWaterfall scenario={scenario} summary={summary} />
      <div>
        <DataRow
          label="Est. settlement"
          value={formatUsd(scenario.estimatedSettlementPriceUsd, 0)}
        />
        <DataRow
          label="PLP price"
          value={formatSharePrice(scenario.estimatedSharePrice)}
        />
      </div>
    </div>
  )
}
