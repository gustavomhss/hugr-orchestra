import { defineConfig } from "@playwright/test"
import { fileURLToPath } from "node:url"
import config from "../../playwright.config"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4549)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  ...config,
  testDir: import.meta.dirname,
  testMatch: "agent-picker.browser.test.ts",
  outputDir: "../test-results/agent-picker",
  reporter: [["line"]],
  workers: 1,
  retries: 0,
  use: { ...config.use, baseURL },
  webServer: {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    // PREBUILT is for focused reruns after explicitly building this tree; the default lane always rebuilds.
    command: `${process.env.ORCHESTRA_PICKER_PREBUILT === "1" ? "" : "bunx --no-install vite build --config e2e/orchestra/agent-picker.vite.config.ts && "}bunx --no-install vite preview --config e2e/orchestra/agent-picker.vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/e2e/orchestra/agent-picker.fixture.html`,
    reuseExistingServer: false,
    timeout: 600_000,
  },
})
