/**
 * Production server for the CallIt web app (Node-target SSR build).
 *
 * `vite build` (BUILD_TARGET unset) emits a Web `fetch` SSR handler at
 * dist/server/server.js plus hashed static assets under dist/client. This Bun
 * server serves the static assets first and hands everything else to the SSR
 * handler. We deploy this to the VPS because workerd rejects @dynamic-labs'
 * module-scope `setTimeout`, which breaks the Cloudflare Workers target.
 */
// @ts-expect-error - built artifact, no types; present after `vite build`.
import handler from "./dist/server/server.js"

const CLIENT_DIR = `${import.meta.dir}/dist/client`
const PORT = Number(process.env.PORT) || 3000

const server = Bun.serve({
  port: PORT,
  idleTimeout: 60,
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)

    // Serve a built static asset when the path maps to a real file. "/" and
    // unknown routes fall through to SSR.
    if (pathname !== "/") {
      const file = Bun.file(`${CLIENT_DIR}${pathname}`)
      if (await file.exists()) {
        const immutable = pathname.startsWith("/assets/")
        return new Response(file, {
          headers: immutable
            ? { "cache-control": "public, max-age=31536000, immutable" }
            : {},
        })
      }
    }

    return handler.fetch(request)
  },
})

console.log(`callit-web listening on http://0.0.0.0:${server.port}`)
