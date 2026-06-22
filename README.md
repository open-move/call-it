# CallIt

**The prediction superapp for Sui — built on [DeepBook Predict](https://docs.sui.io/).**

CallIt turns DeepBook Predict's on-chain prediction markets into a full suite of
products people actually want to use: a pro trading terminal, a social arena,
automated strategy vaults, a liquidity pool, and permissionless keeper
infrastructure — every side of Predict, in one app. On-chain, oracle-settled,
and non-custodial (every chain write is wallet-signed client-side).

CallIt **composes** DeepBook Predict rather than competing with it: every Arena
position is a native Predict position and every vault deposit is book liquidity,
so the app drives volume and liquidity back to the protocol.

> **Deeper reading:** [`OVERVIEW.md`](./OVERVIEW.md) — product + architecture.

## The five products

1. **Trade** — open/close prediction positions on live markets. Simple (`Yes`/`No`, fixed risk) and Pro (`Up`/`Down`/`Range`, strikes, expiries, live quotes) views over the same Predict markets.
2. **Arena** — a social layer: creators bond PLP and post a public **call**; others **Back** or **Fade** it (each a native Predict position). Leaderboard + track records.
3. **Earn** — supply DUSDC to the PLP liquidity vault and earn from the flow every call settles against.
4. **Strategies** — five automated, on-chain-settled vaults: Hedged PLP, Range Ladder, Strangle, Bullish Upside, PLP Collar.
5. **Keeper** — permissionless settle-redeem infrastructure + a read-only ops dashboard.

## Repository layout

```
packages/            Move contracts (Sui)
  base_vault/        Shared cash vault + withdrawal queue
  strategies/        hedged_plp · range_ladder · strangle · bullish_upside · plp_collar
  arena/             Social calls (back / fade / claim)
  keeper_rewards/    Keeper incentive vault
services/
  backend/           Elysia + Bun + Drizzle/Postgres — gRPC checkpoint indexer + read APIs
  operator/          Strategy round runner (start/settle) + deploy + sync-config
  keeper/            Settle-redeem worker + status API
web/                 TanStack Start frontend (see web/README.md)
docker-compose.yml   Full local stack
```

## Quick start

Requires [Bun](https://bun.sh), Docker, and the [Sui CLI](https://docs.sui.io/references/cli) (for contracts).

### Full stack (Docker)

```bash
docker compose up --build
```

| Service | URL / port | Notes |
| --- | --- | --- |
| web | http://localhost:3000 | TanStack Start app |
| backend API | http://localhost:8799 | indexer + read APIs |
| keeper status | http://localhost:8801 | ops dashboard API |
| operator | — | round runner (no server) |
| postgres | localhost:5439 | db `callit` |

### Frontend only

```bash
cd web && bun install && bun run dev    # http://localhost:3000
```

See [`web/README.md`](./web/README.md) for the frontend stack, routes, and conventions.

### Services (dev)

```bash
cd services/backend  && bun install && bun run dev    # API + indexer
cd services/operator && bun install                   # bun run sync-config after a deploy
cd services/keeper   && bun install && bun run dev    # settle-redeem worker
```

### Contracts

```bash
cd packages/<package> && sui move build && sui move test
```

`services/operator` publishes/bootstraps the packages and writes
`deployment.<network>.json`; `bun run sync-config` then generates
`web/src/lib/deployment.ts` and patches the service env — **never hand-edit the
generated deployment files.**

## Testnet targets

- Predict server: `https://predict-server.testnet.mystenlabs.com`
- Predict package: `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138`
- Predict object: `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a`
- Quote asset (DUSDC): `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC`

## Principles

- **Non-custodial** — the backend never signs or holds keys; all chain writes are wallet-signed in the browser.
- **Oracle is the source of truth** — settlement is driven by the price oracle; contracts have no discretionary settle step.
- **One deployment manifest → every service config** — no drift.
- **Fixed risk, never margin** — Predict premium is a capped loss; no borrowing, no liquidation.
