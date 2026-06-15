import { createFileRoute } from "@tanstack/react-router"

import { Page as ShieldClaimsPage } from "@/components/shield/claims-page"

export const Route = createFileRoute("/shield/claims")({
  component: ShieldClaims,
})

function ShieldClaims() {
  return <ShieldClaimsPage />
}
