import { defineConfig } from "@playwright/test"
import config from "./playwright.config"

// Set PLAYWRIGHT_BASE_URL only when reusing an already-built isolated production preview.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4421)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  ...config,
  testMatch: [
    "orchestra/workflow-review.spec.ts",
    "orchestra/workflow-lifetime.spec.ts",
    "orchestra/chapter-workflows.spec.ts",
    "orchestra/workflow-final.spec.ts",
  ],
  grep: /cold review:|lifetime:|workflow authoring:|a template that can run is copied|final fixes:/,
  outputDir: "../test-results/workflow-production",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 3,
  globalTimeout: 900_000,
  reporter: [["line"]],
  use: { ...config.use, baseURL, video: "off", trace: "retain-on-failure" },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    ...config.webServer,
    command: `bun run build && bun run serve -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      VITE_ORCHESTRA_SERVER_HOST: process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1",
      VITE_ORCHESTRA_SERVER_PORT: process.env.PLAYWRIGHT_SERVER_PORT ?? "4096",
      GOMAXPROCS: "2",
    },
  },
})
