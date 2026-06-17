import { createFileRoute } from "@tanstack/react-router"

import { Page as ProtectClaimsPage } from "@/components/protect/claims-page"

export const Route = createFileRoute("/protect/claims")({
  component: ProtectClaims,
})

function ProtectClaims() {
  return <ProtectClaimsPage />
}
