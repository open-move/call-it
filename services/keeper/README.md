# CallIt Keeper

Standalone settled-position keeper for DeepBook Predict binary positions.

V0 is intentionally small:

- Sui gRPC only
- Drizzle + SQLite
- Docker persistent volume
- Binary redemption only (no range redemption)
- Optional reward vault: routes through `reward_vault::redeem_with_reward` when
  configured, falling back to plain `predict::redeem_permissionless` when the
  vault can't pay

## Commands

```bash
bun run status
bun run scan
bun run reconcile
bun run once
bun run start
```

## Docker

```bash
cp .env.example .env
docker compose up --build
```

SQLite is stored at `/app/data/keeper.sqlite` inside the container and should be mounted as a volume.
