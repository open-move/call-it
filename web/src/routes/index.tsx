import { createFileRoute } from "@tanstack/react-router"

import { Page as LandingPage } from "@/components/landing/page"
import { loadLandingStats } from "@/lib/landing/use-landing-stats"

export const Route = createFileRoute("/")({
  loader: () => loadLandingStats(),
  component: Landing,
})

function Landing() {
  const stats = Route.useLoaderData()

  return <LandingPage stats={stats} />
}
