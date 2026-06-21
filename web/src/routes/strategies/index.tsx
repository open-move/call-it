import { createFileRoute } from "@tanstack/react-router"

import { Page as StrategiesPage } from "@/components/strategies/page"

export const Route = createFileRoute("/strategies/")({
  component: Strategies,
})

function Strategies() {
  return <StrategiesPage />
}
