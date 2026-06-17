import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/protect")({
  component: ProtectLayout,
})

function ProtectLayout() {
  return <Outlet />
}
