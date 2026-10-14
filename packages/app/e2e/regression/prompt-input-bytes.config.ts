import { defineConfig } from "@playwright/test"
import config from "../playwright.production.config"

export default defineConfig({
  ...config,
  testDir: "..",
  testMatch: "regression/prompt-input-bytes.production.ts",
  workers: 1,
  retries: 0,
})
