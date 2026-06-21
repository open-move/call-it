FROM node:24-bookworm-slim

WORKDIR /app

RUN npm install -g bun@1.2.10

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run typecheck

ENV KEEPER_DB_PATH=/app/data/keeper.sqlite
VOLUME ["/app/data"]

# Read-only status API (watch + serve)
EXPOSE 8801

ENTRYPOINT ["node", "--import", "tsx", "src/index.ts"]
CMD ["watch"]
