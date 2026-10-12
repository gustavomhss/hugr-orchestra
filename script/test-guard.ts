// Preloaded by every package's bunfig.toml: tests in this repository run on GitHub Actions, never locally.
// GitHub sets CI=true on its runners; only the owner may allow a local run.
import { afterAll } from "bun:test"
import { clearInterval, setInterval } from "node:timers"

if (process.env.CI !== "true" && process.env.ORCHESTRA_LOCAL_TESTS !== "1") {
  console.error(
    [
      "Local test runs are disabled in this repository; tests run on GitHub Actions.",
      "From the repository root: bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]",
      "Only the owner can allow a local run, with ORCHESTRA_LOCAL_TESTS=1.",
    ].join("\n"),
  )
  process.exit(1)
}

if (process.platform === "win32") {
  // Bun 1.3.14 cannot wake an idle Windows loop for a test timeout (oven-sh/bun#32056).
  // Keep this timer ref'd across all test files; a preload's afterAll runs once at the end of the run.
  const timer = setInterval(() => {}, 1_000)
  afterAll(() => clearInterval(timer))
}
