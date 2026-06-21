FROM node:24-bookworm-slim

WORKDIR /app

RUN npm install -g bun@1.2.10

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run typecheck

# Strategy round runner (no HTTP server). Reads on-chain ids from
# deployment.<network>.json and signs with SUI_KEEPER_KEY from the env.
ENTRYPOINT ["bun", "src/index.ts"]
CMD ["--watch", "--run-all"]
