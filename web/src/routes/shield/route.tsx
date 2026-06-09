import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/shield")({
  component: ShieldLayout,
})

function ShieldLayout() {
  return <Outlet />
}
