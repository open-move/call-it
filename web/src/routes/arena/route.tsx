import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/arena")({
  component: ArenaLayout,
})

function ArenaLayout() {
  return <Outlet />
}
