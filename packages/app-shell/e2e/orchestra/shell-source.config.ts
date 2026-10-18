import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "shell-source.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: "line",
  // A caller supplies an already-running integrated source preview; this test never starts one.
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4451",
    browserName: "chromium",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
  },
})
