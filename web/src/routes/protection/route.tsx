import { createFileRoute } from "@tanstack/react-router"

import { Page as ProtectionPage } from "@/components/protection/page"

export const Route = createFileRoute("/protection")({
  component: Protection,
})

function Protection() {
  return <ProtectionPage />
}
