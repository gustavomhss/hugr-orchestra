import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/**/*.sql.ts", "./src/**/sql.ts"],
  // `bun run migration` overrides `out` and only runs `generate`, which reads the schema globs and never opens a database.
  // The URL stays in-memory so `drizzle-kit push` or `studio` cannot touch a real database by accident.
  out: "./migration",
  dbCredentials: {
    url: ":memory:",
  },
})
