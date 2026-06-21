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
const config = defineConfig(() => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    ...(isCloudflare ? [cloudflare({ viteEnvironment: { name: "ssr" } })] : []),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
}))

export default config
