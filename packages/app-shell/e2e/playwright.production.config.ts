import path from "node:path"
import { defineConfig } from "@playwright/test"
import config from "../playwright.config"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000)

// defineConfig(config, override) concatenates webServer entries, which starts dev and preview on one port.
export default defineConfig({
  ...config,
  testDir: ".",
  // The DebugBar these specs drive exists only in the dev server.
  grepInvert: process.env.ORCHESTRA_CHANNEL === "prod"
    ? /@development-only|@development-channel/
    : /@development-only|@production-channel/,
  // Specs read this to prove dev-only marks and controls are absent from the built bundle.
  metadata: { ...config.metadata, bundle: "production" },
  outputDir: "./test-results",
  reporter: [["html", { outputFolder: "./playwright-report", open: "never" }], ["line"], ["./utils/flaky-reporter.ts"]],
  webServer: {
    ...config.webServer,
    cwd: path.resolve(import.meta.dirname, "../../../apps/web"),
    command: `bun run build && bun run serve -- --host 0.0.0.0 --port ${port} --strictPort`,
    reuseExistingServer: false,
  },
  use: {
    ...config.use,
    trace: "retain-on-failure",
  },
})
