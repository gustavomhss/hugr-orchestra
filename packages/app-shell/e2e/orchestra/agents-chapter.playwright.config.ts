import { defineConfig } from "@playwright/test"
import { fileURLToPath } from "node:url"
import config from "../../playwright.config"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4551)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  ...config,
  testDir: import.meta.dirname,
  testMatch: "chapter-agents.spec.ts",
  outputDir: "../test-results/agents-chapter",
  reporter: [["line"]],
  workers: 1,
  retries: 0,
  use: { ...config.use, baseURL },
  webServer: {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    command: `bun run build && bun run serve -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 600_000,
  },
})
