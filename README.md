# CallIt

**The prediction hub for Sui, built on [DeepBook Predict](https://www.deepbook.tech/).**

CallIt turns DeepBook Predict's on-chain prediction markets into a full suite of products people actually want to use: a pro trading terminal, a social arena, automated strategy vaults, a liquidity pool, and permissionless keeper infrastructure. Every market is oracle-settled and every action is wallet-signed, so the app is non-custodial end to end.

CallIt **composes** DeepBook Predict rather than competing with it. Every Arena bet is a native Predict position and every vault round is book liquidity, so the app drives volume and liquidity straight back to the protocol.

## What is in the box

- **Eight Move packages**: a shared async vault, five automated strategy vaults, a social arena, and a keeper reward vault.
- **Three backend services**: a checkpoint indexer, a strategy round runner, and a settle-redeem keeper.
- **One frontend**: a TanStack Start app spanning all five products plus portfolio, leaderboard, and a risk console.
- **One deployment manifest** feeds every service, so on-chain identifiers never drift across the stack.

## The five products

| Product | What it is |
| --- | --- |
| **Trade** | Open and close prediction positions on live markets. Simple (`Yes`/`No`, fixed risk) and Pro (`Up`/`Down`/`Range`, strikes, expiries, live prices) over the same Predict markets. |
| **Arena** | A social layer. A creator posts a public **call** backed by a locked PLP bond; anyone **backs** or **fades** it by opening their own native Predict position. Track records and a leaderboard. |
| **Earn** | Supply DUSDC to the PLP pool that takes the other side of every position. Share value moves with the book. |
| **Strategies** | Five automated, on-chain-settled vaults that run a set play each round: Tail-Hedge PLP, PLP Collar, Short Strangle, Bullish Upside, and Range Ladder. |
| **Keeper** | Permissionless settle-redeem infrastructure, with a read-only operations dashboard. |

## Contracts

Eight Move packages on Sui. The base vault holds capital and runs the queues; each strategy is its own package that deploys into DeepBook Predict per round; the arena and reward vault layer social and incentive logic on top.

| Package | Source | Role |
| --- | --- | --- |
| `base_vault` | [`packages/base_vault`](./packages/base_vault) | Shared single-asset cash vault. Mints base shares against deposits and runs the asynchronous [deposit](./packages/base_vault/sources/deposit_queue.move) and [withdrawal](./packages/base_vault/sources/withdrawal_queue.move) queues every strategy settles through. |
| `hedged_plp_strategy` | [`packages/strategies/hedged_plp`](./packages/strategies/hedged_plp) | Tail-Hedge PLP vault. Supplies pool liquidity alongside a budget-limited downside position. |
| `plp_collar_strategy` | [`packages/strategies/plp_collar`](./packages/strategies/plp_collar) | PLP Collar vault. Pool liquidity inside a bought floor and a sold cap. |
| `strangle_strategy` | [`packages/strategies/strangle`](./packages/strategies/strangle) | Short Strangle vault. Profits when the price finishes between two strikes. |
| `bullish_upside_strategy` | [`packages/strategies/bullish_upside`](./packages/strategies/bullish_upside) | Bullish Upside vault. Earns a premium from a capped-bullish position. |
| `range_ladder_strategy` | [`packages/strategies/range_ladder`](./packages/strategies/range_ladder) | Range Ladder vault. A ladder of range positions around spot. |
| `arena` | [`packages/arena`](./packages/arena) | Social [calls](./packages/arena/sources/call.move). A creator bonds PLP and posts a direction; others back or fade with their own Predict positions. The bond returns to the creator at settlement. |
| `keeper_rewards` | [`packages/keeper_rewards`](./packages/keeper_rewards) | Keeper incentive vault. Pays a fixed, operator-funded tip per redemption. |

The vaults follow an ERC-7540 style async model: capital deploys at the start of a round, and deposits and withdrawals made mid-round queue and settle off the round's final result rather than a mid-round estimate.

## Services and app

| Component | Source | Role |
| --- | --- | --- |
| `backend` | [`services/backend`](./services/backend) | Bun, Drizzle, and Postgres. A gRPC checkpoint indexer plus read APIs for the app and leaderboard. |
| `operator` | [`services/operator`](./services/operator) | Strategy round runner that opens and settles rounds, plus the deploy and config-sync scripts. |
| `keeper` | [`services/keeper`](./services/keeper) | Permissionless worker that redeems settled positions, with a read-only status API for the dashboard. |
| `web` | [`web`](./web) | TanStack Start frontend for every product surface. See [`web/README.md`](./web/README.md). |

## Repository layout

```text
packages/            Move contracts (Sui)
  base_vault/        Shared cash vault + deposit/withdrawal queues
  strategies/        hedged_plp · plp_collar · strangle · bullish_upside · range_ladder
  arena/             Social calls (back / fade / claim)
  keeper_rewards/    Keeper incentive vault
services/
  backend/           Bun + Drizzle/Postgres, checkpoint indexer + read APIs
  operator/          Strategy round runner (start/settle) + deploy + sync-config
  keeper/            Settle-redeem worker + status API
web/                 TanStack Start frontend
docs-site/           Mintlify documentation (user guide + technical guide)
docker-compose.yml   Full local stack
```

## Quick start

Requires [Bun](https://bun.sh), Docker, and the [Sui CLI](https://docs.sui.io/references/cli) for contracts.

### Full stack

```bash
docker compose up --build
```

| Service | URL | Notes |
| --- | --- | --- |
| web | http://localhost:3000 | TanStack Start app |
| backend API | http://localhost:8799 | indexer + read APIs |
| keeper status | http://localhost:8801 | dashboard API |
| postgres | localhost:5439 | database `callit` |

### Frontend only

```bash
cd web && bun install && bun run dev
```

### Services in development

```bash
cd services/backend  && bun install && bun run dev    # API + indexer
cd services/keeper   && bun install && bun run dev    # settle-redeem worker
cd services/operator && bun install                   # bun run sync-config after a deploy
```

### Contracts

```bash
cd packages/<package> && sui move build && sui move test
```

## Deploy and configuration

`services/operator` publishes and bootstraps the packages and writes `deployment.<network>.json`, the single source of truth for every on-chain identifier. `bun run sync-config` then generates `web/src/lib/deployment.ts` and patches each service's environment from that manifest.

```bash
cd services/operator
bun run deploy        # publish contracts, write deployment.<network>.json
bun run sync-config   # propagate identifiers to every service
```

Never hand-edit the generated deployment files.

## Testnet targets

| Target | Value |
| --- | --- |
| Predict server | `https://predict-server.testnet.mystenlabs.com` |
| Predict package | `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` |
| Predict object | `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a` |
| Quote asset (DUSDC) | `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC` |

## Documentation

- [`docs-site`](./docs-site) is the Mintlify documentation, split into a consumer user guide and a developer technical guide. Run `cd docs-site && mint dev` to preview.
- [`OVERVIEW.md`](./OVERVIEW.md) covers the product and architecture in more depth.

## Principles

- **Non-custodial.** No service holds keys or signs for users. Every chain write is wallet-signed in the browser.
- **The oracle is the source of truth.** Settlement follows from the price oracle. Contracts have no discretionary settle step.
- **One manifest, every config.** A single deployment manifest feeds the whole stack.
- **Fixed risk, never margin.** A prediction's loss is capped at its premium. No borrowing, no liquidation.
