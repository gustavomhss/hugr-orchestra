import { defineConfig } from "@playwright/test"
import config from "../../playwright.config"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4313)
const baseURL = `http://127.0.0.1:${port}`
const serverHost = process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"
const serverPort = process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"

export default defineConfig({
  ...config,
  testDir: "..",
  outputDir: "../test-results/orchestra",
  reporter: [["line"]],
  testMatch: [
    "orchestra/**/*.spec.ts",
    "regression/session-request-docks.spec.ts",
    "user-story/model-selection-flow.spec.ts",
  ],
  testIgnore: "**/*.test.ts",
  workers: 1,
  retries: 0,
  use: { ...config.use, baseURL },
  webServer: {
    command: `bun run build && bun run serve -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_ORCHESTRA_SERVER_HOST: serverHost, VITE_ORCHESTRA_SERVER_PORT: serverPort },
  },
})
