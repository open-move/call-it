import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/range-ladder")({
  component: RangeLadderLayout,
})

function RangeLadderLayout() {
  return <Outlet />
}
