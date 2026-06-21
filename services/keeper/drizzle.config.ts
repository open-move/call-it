import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.KEEPER_DB_PATH ?? "./data/keeper.sqlite",
  },
  out: "./drizzle",
  schema: "./src/db/schema.ts",
})
