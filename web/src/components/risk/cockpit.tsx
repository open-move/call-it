import { useState } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { getChartValue } from "@/lib/risk/helpers"
import type { ChartMetric } from "@/lib/risk/helpers"
import type { RiskModel, RiskScenarioId, RiskScenarioRow } from "@/lib/risk/types"
import { ScenarioChartPanel } from "./scenario-chart"
import { ScenarioComparison } from "./scenario-comparison"
import { ScenarioReadout } from "./scenario-readout"

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
    <Card className="overflow-hidden rounded-lg border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
          <ScenarioChartPanel
            metric={metric}
            onMetricChange={setMetric}
            onScenarioChange={onScenarioChange}
            rows={chartRows}
            selectedScenario={selectedScenario}
          />
          <div className="lg:border-l lg:border-border/40 lg:pl-5">
            <ScenarioReadout scenario={selectedScenario} summary={model.summary} />
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
