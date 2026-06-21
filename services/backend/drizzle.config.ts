import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://callit:callit@localhost:5432/callit_backend",
  },
  out: "./drizzle",
  schema: "./src/db/schema.ts",
})
