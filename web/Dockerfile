FROM node:24-bookworm-slim

WORKDIR /app

RUN npm install -g bun@1.2.10

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Default `vite build` target is the Node SSR server (BUILD_TARGET unset). The
# public VITE_* values come from .env.production, inlined at build time.
RUN bun run build

# server.ts serves dist/client statics + the SSR fetch handler.
ENV PORT=3000
EXPOSE 3000

CMD ["bun", "server.ts"]
