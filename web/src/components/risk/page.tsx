import { useState } from "react"

import type { RiskModel, RiskScenarioId } from "@/lib/risk/types"
import { AuditTape } from "./audit-tape"
import { RiskCockpit } from "./cockpit"
import { ExposureBook } from "./exposure-book"
import { RiskHeader } from "./header"
import { RiskHero } from "./hero"

export interface RiskPageProps {
  model: RiskModel
}

export function Page({ model }: RiskPageProps) {
  const defaultScenario =
    model.scenarioRows.find((row) => row.id === "btc-crash-25") ??
    model.scenarioRows[0]
  const [selectedScenarioId, setSelectedScenarioId] = useState<RiskScenarioId>(
    defaultScenario.id
  )
  const selectedScenario =
    model.scenarioRows.find((row) => row.id === selectedScenarioId) ??
    defaultScenario

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <RiskHeader model={model} />
        <RiskHero model={model} selectedScenario={selectedScenario} />
        <RiskCockpit
          model={model}
          onScenarioChange={setSelectedScenarioId}
          selectedScenario={selectedScenario}
        />
        <ExposureBook model={model} />
        <AuditTape model={model} />
      </section>
    </main>
  )
}
