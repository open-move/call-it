import { createFileRoute } from "@tanstack/react-router"

import { Page as ProtectPage } from "@/components/protect/page"

export const Route = createFileRoute("/protect/")({
  component: Protect,
})

function Protect() {
  return <ProtectPage />
}
