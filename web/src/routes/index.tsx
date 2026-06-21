import { createFileRoute } from "@tanstack/react-router"

import { Page as LandingPage } from "@/components/landing/page"

export const Route = createFileRoute("/")({
  component: LandingPage,
})
