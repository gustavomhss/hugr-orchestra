import { defineConfig } from "@playwright/test"
import { fileURLToPath } from "node:url"
import config from "../../playwright.config"

const port = Number(process.env.DIRECTORY_RECOVERY_PORT ?? 4550)
const baseURL = `http://127.0.0.1:${port}`
const output = "e2e/test-results/directory-recovery-dist"

export default defineConfig({
  ...config,
  testDir: ".",
  testMatch: "directory-recovery.pw.ts",
  outputDir: "../test-results/directory-recovery",
  reporter: [["line"]],
  workers: 1,
  retries: 0,
  use: { ...config.use, baseURL },
  webServer: {
    command: `bun --bun node_modules/.bin/vite build --config e2e/regression/directory-recovery.vite.ts --outDir ${output} && bun --bun node_modules/.bin/vite preview --outDir ${output} --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/e2e/regression/directory-recovery.fixture.html`,
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    reuseExistingServer: false,
    timeout: 300_000,
  },
})
