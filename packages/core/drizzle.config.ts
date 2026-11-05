import { defineConfig } from "drizzle-kit"

// `script/migration.ts` imports this config and overrides `out` before `drizzle-kit generate`.
// Other drizzle-kit commands that load this file use the in-memory URL as their default.
// Nothing in this file rejects another URL.
export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/**/*.sql.ts", "./src/**/sql.ts"],
  out: "./migration",
  dbCredentials: {
    url: ":memory:",
  },
})
