# CallIt Keeper

Standalone settled-position keeper for DeepBook Predict binary positions.

V0 is intentionally small:

- Sui gRPC only
- Drizzle + SQLite
- Docker persistent volume
- Binary `predict::redeem_permissionless` only
- No range redemption
- No reward vault

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
