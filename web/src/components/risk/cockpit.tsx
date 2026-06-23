import { useState } from "react"

import { Card, CardContent } from "@/components/ui/card"
import {
  formatQuoteAmount,
  formatSharePrice,
  getChartValue,
} from "@/lib/risk/helpers"
import type { ChartMetric } from "@/lib/risk/helpers"
import type {
  RiskModel,
  RiskScenarioId,
  RiskScenarioRow,
} from "@/lib/risk/types"
import type { VaultSummary } from "@/lib/types/predict"
import { cn } from "@/lib/utils"
import { ScenarioChartPanel } from "./scenario-chart"
import { ScenarioComparison } from "./scenario-comparison"
import { ScenarioReadout } from "./scenario-readout"
import { RiskVerdict } from "./verdict"

function BaselineStrip({ summary }: { summary: VaultSummary }) {
  const items = [
    { label: "Strategy NAV", value: formatQuoteAmount(summary.vault_value) },
    {
      label: "Withdrawable now",
      value: formatQuoteAmount(summary.available_withdrawal),
    },
    {
      label: "Open max payout",
      value: formatQuoteAmount(summary.total_max_payout),
    },
    { label: "PLP price", value: formatSharePrice(summary.plp_share_price) },
  ]

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border/40 pb-4 sm:grid-cols-4 sm:gap-x-0 sm:divide-x sm:divide-border/40">
      {items.map((item, index) => (
        <div className={cn("min-w-0", index > 0 && "sm:pl-5")} key={item.label}>
          <div className="text-[11px] text-muted-foreground">{item.label}</div>
          <div className="mt-1 truncate font-mono text-sm font-medium text-foreground tabular-nums">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

export function RiskCockpit({
  model,
  onScenarioChange,
  selectedScenario,
}: {
  model: RiskModel
  onScenarioChange: (scenarioId: RiskScenarioId) => void
  selectedScenario: RiskScenarioRow
}) {
  const [metric, setMetric] = useState<ChartMetric>("drawdown")
  const chartRows = model.scenarioRows.map((row) => ({
    ...row,
    chartValue: getChartValue(row, metric),
  }))

  return (
    <Card className="rounded-lg border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="space-y-5 p-4 sm:p-5">
        <BaselineStrip summary={model.summary} />

        <RiskVerdict
          model={model}
          onScenarioChange={onScenarioChange}
          selectedScenario={selectedScenario}
        />

        <div className="grid gap-5 border-t border-border/40 pt-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
          <ScenarioChartPanel
            metric={metric}
            onMetricChange={setMetric}
            onScenarioChange={onScenarioChange}
            rows={chartRows}
            selectedScenario={selectedScenario}
          />
          <div className="lg:border-l lg:border-border/40 lg:pl-5">
            <ScenarioReadout
              scenario={selectedScenario}
              summary={model.summary}
            />
          </div>
        </div>

        <ScenarioComparison
          onScenarioChange={onScenarioChange}
          rows={model.scenarioRows}
          selectedScenarioId={selectedScenario.id}
        />
      </CardContent>
    </Card>
  )
}
