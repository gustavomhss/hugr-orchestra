import { defineConfig } from "@playwright/test"
import config from "../../playwright.config"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4992)

export default defineConfig({
  ...config,
  testDir: ".",
  testMatch: ["evidence.spec.ts", "evidence-actions.spec.ts"],
  outputDir: "../test-results/evidence-production",
  workers: 1,
  retries: 0,
  webServer: {
    ...config.webServer,
    command: `bun run build --logLevel error && bun run serve -- --host 127.0.0.1 --port ${port} --strictPort`,
    reuseExistingServer: false,
    timeout: 900_000,
  },
})
