import { createFileRoute, Outlet } from "@tanstack/react-router"

// Layout for the strategies section. The landing lives in index.tsx; detail
// pages render at /strategies/$strategyId.
export const Route = createFileRoute("/strategies")({
  component: () => <Outlet />,
})
