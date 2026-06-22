# CallIt

**The prediction superapp for Sui — built on DeepBook Predict.**

CallIt turns DeepBook Predict into a full suite of products people actually want to use: a pro
trading terminal, a social arena, automated strategy vaults, a liquidity pool,
and permissionless keeper infrastructure — every side of Predict, in one app.
On-chain, oracle-settled, non-custodial.

CallIt **composes** DeepBook Predict rather than competing with it: every Arena
position is a native Predict position and every vault deposit is book liquidity,
so the app drives volume and liquidity back to the protocol. We grow the pie, we
don't fork it.

---

## Why

DeepBook Predict gives Sui a powerful primitive: fully on-chain prediction
markets with fixed premium and payout, settled by a price oracle. But a
primitive is not a product. Today using it means raw transactions and protocol
language.

CallIt is the consumer layer: a single app where a casual user calls "BTC up or
down by 2pm" as a simple Yes/No, a power user trades strikes and expiries, a
liquidity provider earns on the flow, a depositor lets an automated vault run
strategies, and a keeper keeps the whole thing settling — all wallet-signed,
all transparent on-chain.

---

## What it does — five products, one app

### 1. Trade
Open and close prediction positions on live BTC markets.
- **Simple mode** — markets as questions, `Yes` / `No`, risk a fixed premium.
- **Pro mode** — `Up` / `Down` / `Range`, strikes, expiries, live quotes.
- Premium and payout are fixed *before* you confirm. No leverage, no liquidation.
- Mint and redeem are native DeepBook Predict positions, settled by the oracle.

### 2. Arena — the differentiator
A social/skill layer on top of Predict. Creators **bond PLP capital** and post a
public **call** on a market. Everyone else can **Back** it (take the same side)
or **Fade** it (take the opposite) — each action opens a *native Predict
position* for the participant. Track records and a leaderboard make sharp
callers discoverable.
- Creators reclaim their bond after settlement (`claim_bond`); participants
  claim their payouts (redeem) — both from the call page.
- Settlement is driven entirely by the oracle (the contract has **no
  discretionary settle step**), so outcomes can't be quietly changed.

### 3. Earn
Supply DUSDC to the PLP liquidity vault and earn from every trade that crosses
the book — the liquidity every call settles against. Mint PLP shares, withdraw
against available liquidity.

### 4. Strategies
Five automated, DOV-style strategy vaults that trade the book for you and settle
each round on-chain: **Hedged PLP, Range Ladder, Strangle, Bullish Upside, PLP
Collar.** Deposit DUSDC, receive strategy shares; withdrawals are queued and
claimed pull-style (no liquidity surprises mid-round). An off-chain **operator**
drives each round's start/settle.

### 5. Keeper
Permissionless infrastructure: anyone can run a keeper that redeems settled
positions and earns a reward from the keeper-rewards vault. Open to anyone, so
the market keeps settling without a privileged operator.

*(Portfolio ties a wallet's positions and activity across surfaces together.)*

---

## How it works

```
            ┌─────────────────────────────────────────────────────────┐
            │                     CallIt frontend                      │
            │   TanStack Start (React, SSR) · Tailwind · shadcn/base-ui │
            │   Dynamic auth · @mysten/sui PTBs (wallet-signed writes)  │
            └───────────────┬──────────────────────────┬──────────────┘
        reads (composed)    │                          │  writes (client-signed)
            ┌───────────────▼─────────────┐            │
            │       CallIt backend         │            │
            │  Bun · Elysia · Drizzle/PG   │            │
            │  gRPC checkpoint-stream index │            ▼
            │  Dynamic JWT → backend JWT    │   ┌──────────────────────────┐
            │  composes the Predict server  │   │   Sui (testnet) — Move    │
            └───────────────┬──────────────┘   │  arena · base_vault +     │
                            │ reads             │  withdrawal_queue · 5     │
            ┌───────────────▼──────────────┐    │  strategy vaults ·        │
            │     DeepBook Predict server   │    │  keeper_rewards           │
            │   (markets, oracles, prices)  │    │  ── on DeepBook Predict ──│
            └───────────────────────────────┘   └────────▲─────────▲───────┘
                                                          │         │
                                   operator (rounds) ─────┘         └──── keeper (redeem)
```

**Contracts (Move 2024, Sui testnet)**
- `arena` — calls, back/fade, bond claim/reclaim. The **oracle is the single
  source of truth**: no on-chain settle step; a call is settled iff its oracle
  is, with an expiry-grace `reclaim_bond` escape hatch.
- `base_vault` + a reusable `WithdrawalQueue` — cash-less accounting,
  pro-rata reserved shares, O(1) settlement, dust-to-last-claimant.
- 5 strategy vaults built on the base vault.
- `keeper_rewards` — funds the permissionless redeem incentive.

**Backend** (`services/backend`) — reads-through proxy + indexer + identity.
- Composes the Predict server rather than re-indexing what Predict already does.
- Indexes Arena events into Postgres projections (calls, creators, activity).
- Identity: verifies the Dynamic JWT, issues its own short-lived backend JWT,
  stores users + wallets, lets users set an Arena username.
- **gRPC checkpoint-streaming indexer** (`subscribeCheckpoints` + bounded
  backfill + idle-watchdog) — deliberately built off JSON-RPC, which Sui is
  deprecating.

**Frontend** (`web`) — TanStack Start (SSR, file routes + loaders), Tailwind,
shadcn/base-ui on CallIt primitives, Dynamic.xyz wallet auth. Every chain write
is a wallet-signed PTB built with `@mysten/sui` — the backend never signs or
holds keys.

**Operator** (`services/operator`) — drives start/settle rounds for all five
strategies; also publishes + bootstraps the whole deployment and syncs every
service config from a single manifest.

**Keeper** (`services/keeper`) — streaming indexer → reconcile → redeem settled
positions, earning keeper rewards (also on the gRPC streaming engine).

---

## Principles (the invariants)

- **Non-custodial.** All chain writes are wallet-signed client-side; the backend
  never signs or holds keys.
- **Oracle is the single source of truth** for settlement — transparent,
  non-discretionary outcomes.
- **Read through the backend, which composes the Predict server** — never
  re-index what Predict already provides.
- **No borrowing, no liquidation** — premium and payout are fixed up front.
- **One deployment manifest → every service config** — no environment drift.

---

## Tech stack

| Layer | Stack |
|---|---|
| Contracts | Move 2024 on Sui, on top of DeepBook Predict |
| Frontend | TanStack Start/Router (React, SSR), Tailwind v4, shadcn/base-ui, Dynamic.xyz, `@mysten/sui` (gRPC + PTBs), TanStack Query/Form/Table, Recharts, Motion |
| Backend | Bun, Elysia, Drizzle ORM + Postgres, Zod, Pino, jose (JWT) |
| Indexing | Sui gRPC `subscribeCheckpoints` streaming + backfill |
| Ops | Docker Compose (postgres, backend, keeper, operator) |

---

## Status

Live on **Sui testnet**, full stack running under Docker Compose:
- All 8 Move packages published + bootstrapped (arena, base_vault, 5 strategies,
  keeper_rewards).
- Backend indexing the live Arena; identity/auth working end-to-end (wallet →
  Dynamic → backend session → user + wallet in Postgres).
- Real on-chain Arena activity executed with DUSDC (launch, back, fade, claim).
- Keeper live (dry-run off), redeeming settled positions; operator running rounds.

**DeepBook Predict (testnet) targets**
- Predict server: `https://predict-server.testnet.mystenlabs.com`
- Predict package: `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138`
- Quote asset: `…::dusdc::DUSDC`

**CallIt deployed packages (testnet)** — full id set in
`services/operator/deployment.testnet.json`:
- Arena: `0x2feb9cafa30c952d2c8d8ba4a30b1c5ef74968c686b3c9c5f8db9ca6c6106075`
- Base vault: `0x9985416afd5e475727f8c2c8b407bfbdbbdfc94e3344a20f3ad3ace6e7f9f709`
- Keeper rewards: `0xbe2ca72472f8c9e29d0fee940263fc5eb45363d0de19e959b23fddfc76b38811`

---

## Repo layout

```
web/                 TanStack Start frontend (the five surfaces)
packages/            Move contracts (arena, base_vault, strategies, keeper_rewards)
services/backend/    Bun/Elysia read+index+identity API
services/operator/   deploy + bootstrap + strategy round driver + config sync
services/keeper/     permissionless settled-position redeemer
docker-compose.yml   full local/testnet stack
```

## Run it

```bash
docker-compose up -d            # postgres + backend (:8799) + keeper (:8801) + operator
cd web && bun install && bun dev   # frontend (:3000)
```
