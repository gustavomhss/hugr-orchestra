// Preloaded by every package's bunfig.toml: tests in this repository run on GitHub Actions, never locally.
// GitHub sets CI=true on its runners; only the owner may allow a local run.
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
