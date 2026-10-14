#!/usr/bin/env bun
// `bun run test`, the CLI suite Turbo runs in test.yml's unit lane: every test file here except the ones below, which
// belong to a dedicated native lane and refuse at load anywhere else. A new test file runs by default; leaving one out
// takes an entry naming the lane that runs it.
const elsewhere = [
  // distribution-bundle.yml: native POSIX lifecycle and native macOS Homebrew qualification only.
  "test/distribution-native.test.ts",
  "test/distribution-homebrew.test.ts",
  // distribution-bundle.yml: actual Windows npm and matching native Arch guests.
  "test/distribution-windows.test.ts",
  "test/distribution-aur.test.ts",
  "test/fixture/distribution-aur-guest.test.ts",
  // artifact-native.yml: needs ORCHESTRA_ARTIFACT_NATIVE_LANE on a Darwin, musl or glibc-with-musl host, and imports
  // the artifact suites below on that host.
  "test/artifact-native-lane.test.ts",
  // Imported by artifact-native-lane.test.ts on its Darwin lanes only: needs a case-insensitive APFS volume.
  "test/artifact-case-alias.test.ts",
  // POSIX rename races refuse on Windows; this lane runs them on Linux, and artifact-native.yml on its POSIX hosts.
  ...(process.platform === "win32" ? ["test/artifact-posix-race.test.ts"] : []),
  // distribution-bundle.yml: CLI ubuntu-latest executes Ruby/bash recipes with real jq; Windows lacks this executor.
  ...(process.platform === "win32" ? ["test/distribution-recipes.test.ts"] : []),
]
// An entry that names no file would exclude nothing while claiming another lane covers it.
const missing = (
  await Promise.all(elsewhere.map(async (file) => ((await Bun.file(file).exists()) ? [] : [file])))
).flat()
if (missing.length) throw new Error(`script/test.ts excludes test files that do not exist: ${missing.join(", ")}`)

const child = Bun.spawn(
  [
    process.execPath,
    "test",
    "--timeout",
    "30000",
    ...elsewhere.map((file) => `--path-ignore-patterns=${file}`),
    ...process.argv.slice(2),
  ],
  { stdio: ["inherit", "inherit", "inherit"] },
)
process.exit(await child.exited)
