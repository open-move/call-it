import { createFileRoute } from "@tanstack/react-router"

import { Page as RangeLadderClaimsPage } from "@/components/range-ladder/claims-page"

export const Route = createFileRoute("/range-ladder/claims")({
  component: RangeLadderClaims,
})

function RangeLadderClaims() {
  return <RangeLadderClaimsPage />
}
