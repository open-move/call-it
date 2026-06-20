import { useState } from "react"

import { Card, CardContent } from "@/components/ui/card"
import {
  getChartValue,
  getWorstScenario,
} from "@/lib/risk/helpers"
import type { ChartMetric } from "@/lib/risk/helpers"
import type {
  RiskScenarioGroup,
  RiskScenarioId,
  RiskScenarioRow,
} from "@/lib/risk/types"
import type { RiskModel } from "@/lib/risk/types"
import { RiskRail } from "./risk-rail"
import { ScenarioChartPanel } from "./scenario-chart"
import { ScenarioComparison } from "./scenario-comparison"
import { ScenarioReadout } from "./scenario-readout"
import { ScenarioStack } from "./scenario-stack"

export function RiskCockpit({
  model,
  onScenarioChange,
  selectedScenario,
}: {
  model: RiskModel
  onScenarioChange: (scenarioId: RiskScenarioId) => void
  selectedScenario: RiskScenarioRow
}) {
  const [selectedGroup, setSelectedGroup] = useState<RiskScenarioGroup>(
    selectedScenario.group
  )
  const [metric, setMetric] = useState<ChartMetric>("drawdown")
  const worstScenario = getWorstScenario(model.scenarioRows)
  const visibleRows = model.scenarioRows.filter(
    (row) => row.group === selectedGroup
  )
  const chartRows = model.scenarioRows.map((row) => ({
    ...row,
    chartValue: getChartValue(row, metric),
  }))

  function selectGroup(nextGroup: RiskScenarioGroup) {
    setSelectedGroup(nextGroup)

    const firstScenario = model.scenarioRows.find(
      (row) => row.group === nextGroup
    )

    if (firstScenario) {
      onScenarioChange(firstScenario.id)
    }
  }

  return (
    <Card className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <RiskRail model={model} worstScenario={worstScenario} />

        <div className="grid min-h-[34rem] gap-0 xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
          <ScenarioStack
            onGroupChange={selectGroup}
            onScenarioChange={onScenarioChange}
            rows={visibleRows}
            selectedGroup={selectedGroup}
            selectedScenario={selectedScenario}
          />
          <ScenarioChartPanel
            metric={metric}
            onMetricChange={setMetric}
            rows={chartRows}
            selectedScenario={selectedScenario}
          />
          <ScenarioReadout
            selectedScenario={selectedScenario}
            worstScenario={worstScenario}
          />
        </div>

        <ScenarioComparison rows={model.scenarioRows} />
      </CardContent>
    </Card>
  )
}
