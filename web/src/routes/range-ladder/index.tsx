import { createFileRoute } from "@tanstack/react-router"

import { Page as RangeLadderPage } from "@/components/range-ladder/page"

export const Route = createFileRoute("/range-ladder/")({
  component: RangeLadder,
})

function RangeLadder() {
  return <RangeLadderPage />
}
