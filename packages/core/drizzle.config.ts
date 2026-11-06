import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/**/*.sql.ts", "./src/**/sql.ts", "../../modules/fabric/src/**/sql.ts"],
  out: "./migration",
  dbCredentials: {
    url: "/home/thdxr/.local/share/orchestra/orchestra.db",
  },
})
