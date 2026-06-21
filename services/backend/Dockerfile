FROM node:24-bookworm-slim

WORKDIR /app

RUN npm install -g bun@1.2.10

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run typecheck

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["bun", "src/index.ts"]
CMD ["serve"]
