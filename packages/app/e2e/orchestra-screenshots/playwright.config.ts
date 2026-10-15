import { execFileSync } from "node:child_process"
import { defineConfig } from "@playwright/test"
import config from "../../playwright.config"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5121)
const baseURL = `http://127.0.0.1:${port}`
process.env.PLAYWRIGHT_SERVER_HOST = "127.0.0.1"
process.env.PLAYWRIGHT_SERVER_PORT = "4096"
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
// The build reads the working tree, so a dirty tree is not exactly the named commit.
const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== ""
// Released bundles build on the prod channel; the integration runner keeps Vite's dev-channel default.
const channel = process.env.ORCHESTRA_CHANNEL ?? "prod"

// A screenshot pack for visual acceptance, not a gate: the `.visual.ts` suffix keeps it out of
// the default and integration runners, which only collect `.spec.ts` and `.test.ts` files.
export default defineConfig({
  ...config,
  testDir: ".",
  testMatch: "*.visual.ts",
  testIgnore: [],
  outputDir: "../test-results/orchestra-screenshots",
  reporter: [["line"]],
  timeout: 240_000,
  workers: 1,
  retries: 0,
  fullyParallel: false,
  metadata: {
    ...config.metadata,
    bundle: "production",
    source: `${sha}${dirty ? " with uncommitted changes" : ""}, production build, ${channel} channel`,
  },
  use: { ...config.use, baseURL, video: "off", trace: "off" },
  webServer: {
    command: `bun run build && bun run serve -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 600_000,
    env: { VITE_ORCHESTRA_SERVER_HOST: "127.0.0.1", VITE_ORCHESTRA_SERVER_PORT: "4096", ORCHESTRA_CHANNEL: channel },
  },
})
