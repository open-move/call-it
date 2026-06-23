import { defineConfig } from "vite"
import { cloudflare } from "@cloudflare/vite-plugin"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// The Cloudflare plugin only runs when BUILD_TARGET=cloudflare, emitting a
// workerd bundle for `wrangler deploy`. The default `vite build` produces a
// plain Node server (used for the Docker/VPS deploy); `vite dev` stays on the
// Node dev server. (workerd rejects @dynamic-labs' module-scope setTimeout, so
// the VPS/Node target is the primary deploy path.)
const isCloudflare = process.env.BUILD_TARGET === "cloudflare"

// recharts 3.x renders through an internal react-redux store. Left to Rollup's
// default splitting, recharts and react-redux land in separate lazy chunks, and
// a client-side route transition can load them in an order where a store
// selector is referenced before its module finishes initializing ("t is not a
// function" on SPA nav, fine on a full reload). Coalescing the whole store stack
// into one chunk gives it a single, deterministic eval order.
function chartVendorChunks(id: string) {
  if (
    /[\\/]node_modules[\\/](recharts|react-redux|redux|@reduxjs[\\/]toolkit|reselect|immer|use-sync-external-store)[\\/]/.test(
      id
    )
  ) {
    return "recharts"
  }

  return undefined
}

const config = defineConfig(() => ({
  resolve: { tsconfigPaths: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: chartVendorChunks,
      },
    },
  },
  plugins: [
    ...(isCloudflare ? [cloudflare({ viteEnvironment: { name: "ssr" } })] : []),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
}))

export default config
