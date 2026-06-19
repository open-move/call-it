import { createFileRoute } from "@tanstack/react-router"

import { Page as RiskPage } from "@/components/risk/page"
import { RiskSkeleton } from "@/components/shared/pending-skeleton"
import { buildRiskModel } from "@/lib/risk/calculations"
import type { RiskOracleState } from "@/lib/risk/types"
import {
  getDirectionalPositionMints,
  getDirectionalPositionRedeems,
  getOracleState,
  getPredictOracles,
  getPredictVaultSummary,
  getRangeMints,
  getRangeRedeems,
} from "@/services/predict-client"

const RISK_EVENT_LIMIT = 2_000
const ORACLE_STATE_LIMIT = 24

function getRelevantOracleIds({
  directionalMints,
  directionalRedeems,
  oracleIds,
  rangeMints,
  rangeRedeems,
}: {
  directionalMints: Array<{ oracle_id: string }>
  directionalRedeems: Array<{ oracle_id: string }>
  oracleIds: string[]
  rangeMints: Array<{ oracle_id: string }>
  rangeRedeems: Array<{ oracle_id: string }>
}) {
  const relevantOracleIds = new Set<string>()

  for (const event of [
    ...directionalMints,
    ...directionalRedeems,
    ...rangeMints,
    ...rangeRedeems,
  ]) {
    relevantOracleIds.add(event.oracle_id)
  }

  for (const oracleId of oracleIds) {
    relevantOracleIds.add(oracleId)
  }

  return Array.from(relevantOracleIds).slice(0, ORACLE_STATE_LIMIT)
}

async function loadOracleStates(oracleIds: string[]) {
  const results = await Promise.allSettled(
    oracleIds.map(async (oracleId): Promise<RiskOracleState> => {
      return { oracleId, state: await getOracleState(oracleId) }
    })
  )

  return results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  )
}

export const Route = createFileRoute("/risk")({
  pendingComponent: RiskSkeleton,
  loader: async () => {
    const [
      summary,
      oracles,
      directionalMints,
      directionalRedeems,
      rangeMints,
      rangeRedeems,
    ] = await Promise.all([
      getPredictVaultSummary(),
      getPredictOracles(),
      getDirectionalPositionMints(RISK_EVENT_LIMIT),
      getDirectionalPositionRedeems(RISK_EVENT_LIMIT),
      getRangeMints(RISK_EVENT_LIMIT),
      getRangeRedeems(RISK_EVENT_LIMIT),
    ])
    const activeOracleIds = oracles
      .filter((oracle) => oracle.status === "active")
      .map((oracle) => oracle.oracle_id)
    const oracleStates = await loadOracleStates(
      getRelevantOracleIds({
        directionalMints,
        directionalRedeems,
        oracleIds: activeOracleIds,
        rangeMints,
        rangeRedeems,
      })
    )

    return {
      model: buildRiskModel({
        directionalMints,
        directionalRedeems,
        oracleStates,
        oracles,
        rangeMints,
        rangeRedeems,
        summary,
      }),
    }
  },
  component: Risk,
})

function Risk() {
  const { model } = Route.useLoaderData()

  return <RiskPage model={model} />
}
