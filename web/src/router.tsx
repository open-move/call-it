import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // Don't flash the route's pendingComponent on quick background
    // revalidations (e.g. router.invalidate() after a trade). The skeleton only
    // shows for genuinely slow cold loads; preloaded navigations stay instant.
    defaultPendingMs: 1000,
    defaultPendingMinMs: 300,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
