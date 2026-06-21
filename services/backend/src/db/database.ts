import { drizzle } from "drizzle-orm/node-postgres"
import { migrate as runDrizzleMigrations } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"

import * as schema from "./schema.ts"

export interface Database {
  db: ReturnType<typeof drizzle<typeof schema>>
  pool: Pool
}

export function openDatabase(databaseUrl: string): Database {
  const pool = new Pool({ connectionString: databaseUrl })
  return {
    db: drizzle(pool, { schema }),
    pool,
  }
}

export async function runMigrations(database: Database): Promise<void> {
  await runDrizzleMigrations(database.db, { migrationsFolder: "./drizzle" })
}
