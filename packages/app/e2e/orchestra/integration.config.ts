import { defineConfig } from "@playwright/test"
import config from "../../playwright.config"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5030)
const baseURL = `http://127.0.0.1:${port}`
process.env.PLAYWRIGHT_SERVER_HOST = "127.0.0.1"
process.env.PLAYWRIGHT_SERVER_PORT = "4096"

export default defineConfig({
  ...config,
  testDir: "..",
  testIgnore: "**/performance/**",
  // The default development runner still executes these real DebugBar cases.
  // Production verifies locale-driven RTL without adding debug controls to its bundle.
  grepInvert: /@development-only|@source-fixture/,
  // Specs read this to prove debug-only controls are absent from the built bundle.
  metadata: { ...config.metadata, bundle: "production" },
  outputDir: "../test-results/orchestra-integration",
  // The inherited HTML report path is relative to this config, which would nest it under e2e/orchestra.
  reporter: [["html", { outputFolder: "../playwright-report/orchestra-integration", open: "never" }], ["line"]],
  workers: 1,
  retries: 0,
  fullyParallel: false,
  use: { ...config.use, baseURL },
  webServer: {
    command: `bun run build && bun run serve -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 600_000,
    env: { VITE_ORCHESTRA_SERVER_HOST: "127.0.0.1", VITE_ORCHESTRA_SERVER_PORT: "4096" },
  },
})
