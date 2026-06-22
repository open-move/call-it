# CallIt — Web

The consumer frontend for **CallIt**, the prediction superapp for Sui built on
[DeepBook Predict](https://docs.sui.io/). One app over the protocol's prediction
markets: a pro trading terminal, a social arena, automated strategy vaults, a
liquidity pool, and a keeper ops dashboard — all on-chain, oracle-settled, and
non-custodial (every chain write is wallet-signed client-side).

> For the product story and the full system (Move packages + backend + operator
> + keeper), see [`../OVERVIEW.md`](../OVERVIEW.md).

## Stack

- **[TanStack Start](https://tanstack.com/start)** — SSR + file-based routing (TanStack Router), Vite, React 19
- **Tailwind CSS v4** + **shadcn/[base-ui](https://base-ui.com)** primitives
- **[Dynamic](https://dynamic.xyz)** (`@dynamic-labs/sdk-react-core` + `/sui`) — wallet auth & connection
- **[`@mysten/sui`](https://sdk.mystenlabs.com/)** v2 — `SuiGrpcClient` for on-chain reads + PTB construction
- **TanStack Query / Form / Table**, **Zod** for boundary validation
- Deployed on Cloudflare (`wrangler`)

## Surfaces

| Route | Surface | Notes |
| --- | --- | --- |
| `/` | Landing | The five-product hub story |
| `/markets`, `/markets/$oracleId` | **Trade** | Market list + detail with the order ticket (Simple/Pro) |
| `/arena`, `/arena/$callId`, `/arena/creator/$handle` | **Arena** | Social calls — back / fade / launch / claim |
| `/earn` | **Earn** | Supply/withdraw PLP liquidity |
| `/strategies`, `/strategies/$strategyId` | **Strategies** | Five automated vaults (kebab-case slugs) |
| `/keeper` | **Keeper** | Read-only settle-redeem ops dashboard |
| `/portfolio` | **Portfolio** | Your positions across surfaces |

## Getting started

Requires [Bun](https://bun.sh).

```bash
bun install
bun run dev          # http://localhost:3000
```

The app reads on-chain state directly over gRPC and composes the CallIt backend
(arena/index data) plus the DeepBook Predict server. Configure:

- `web/.env` → `VITE_DYNAMIC_ENVIRONMENT_ID` (Dynamic project) — written by `sync-config`
- `BACKEND_URL` in `src/lib/config.ts` — the CallIt backend (docker-compose maps it to `http://localhost:8799`)

To run the full stack (Postgres + backend + operator + keeper) alongside the
web app, use the root `docker-compose.yml`.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Dev server on port 3000 |
| `bun run build` | Production build |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Vitest |
| `bun run lint` / `format` / `check` | ESLint / Prettier |

## Project structure

```
src/
  routes/        File-based routes (thin; loaders + page composition)
  components/
    ui/          shadcn/base-ui primitives (added via `bunx shadcn@latest add`)
    primitives/  CallIt primitives built on top of shadcn/base-ui
    <surface>/   Product components (markets, market-detail, arena, earn, strategies, …)
  lib/           Domain logic, types, formatters, registries, hooks
  services/      On-chain readers + PTB transaction builders (predict, strategy, arena)
```

## Conventions

- **Generated config:** `src/lib/deployment.ts` (package/object ids) is generated
  by `services/operator` → `bun run sync-config` from the deployment manifest.
  **Do not hand-edit it** — re-run sync after a deploy.
- **Components:** product components use CallIt **primitives**; primitives wrap
  shadcn/base-ui. Don't hand-author `components/ui/*` — install with
  `bunx shadcn@latest add <name>`.
- **Radius:** `rounded-md` is the default for bordered surfaces/controls.
- **No leverage framing:** Predict premium is a fixed risk, never margin — copy
  stays "No borrowing. No liquidation."
