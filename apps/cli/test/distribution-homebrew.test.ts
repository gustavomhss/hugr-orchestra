import { afterAll, beforeAll, expect, test } from "bun:test"
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join, resolve, sep } from "node:path"
import { buildVersions, cli, sandbox, successful, target } from "./fixture/distribution-native"
import { emergencyStop, stopServices } from "./fixture/distribution-native-proof"
import { expectSpawn } from "../../../packages/core/test/fixture/omni-expect"
import { homebrewChannel } from "./fixture/distribution-homebrew"

// HB-NATIVE: matching native macOS only, never a successful unavailable-host skip.
// Run from the integration repo root: bun run test:ci cli ./test/distribution-homebrew.test.ts --os macos
// No provider, foreign-target, published-tap or source-inaccessible sandbox claim.
// Checksum rejection uses real brew; rollback atomically reselects a retained keg at the original prefix launcher.
const state: { directory?: string; preserve: boolean } = { preserve: false }
const previousSDK = process.env.ORCHESTRA_ARTIFACT_DARWIN_SDK
const interrupt = () => { void stopServices().then(() => process.exit(1), () => process.exit(1)) }

beforeAll(async () => {
  if (process.platform !== "darwin" || !["arm64", "x64"].includes(process.arch))
    throw new Error("HOMEBREW_NATIVE_MACOS_HOST_REQUIRED")
  if (process.env.RUNNER_OS !== "macOS") throw new Error("HOMEBREW_NATIVE_MACOS_RUNNER_REQUIRED")
  if (process.versions.bun !== "1.3.14") throw new Error("HOMEBREW_BUN_VERSION_MISMATCH: require 1.3.14")
  if (!process.env.RUNNER_TEMP) throw new Error("HOMEBREW_RUNNER_TEMP_REQUIRED")
  const parent = await realpath(process.env.RUNNER_TEMP)
  // Homebrew protects its state from inherited system-temp write permissions.
  // A private prefix inside /private/var/folders is rejected by current Homebrew.
  if (parent.startsWith(await realpath(tmpdir()))) throw new Error("HOMEBREW_PREFIX_PARENT_IS_SYSTEM_TEMP")
  state.directory = await mkdtemp(join(parent, "orchestra-homebrew-native-"))
  expect(state.directory.startsWith((await realpath(resolve(cli, "../.."))) + sep)).toBe(false)
  process.once("exit", emergencyStop)
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  process.once("SIGHUP", interrupt)
})

afterAll(async () => {
  // HB-CLEANUP: retain launchers, fixtures and exit hooks unless cleanup is proved.
  await stopServices().catch((cause: unknown) => {
    state.preserve = true
    throw new Error(`HOMEBREW_CLEANUP_FAILED: fixture=${state.directory}`, { cause })
  })
  if (previousSDK === undefined) delete process.env.ORCHESTRA_ARTIFACT_DARWIN_SDK
  if (previousSDK !== undefined) process.env.ORCHESTRA_ARTIFACT_DARWIN_SDK = previousSDK
  if (state.preserve) throw new Error(`HOMEBREW_FIXTURE_PRESERVED: ${state.directory}`)
  process.off("exit", emergencyStop)
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", interrupt)
  process.off("SIGHUP", interrupt)
  if (state.directory) await rm(state.directory, { recursive: true, force: true })
}, 120_000)

test("HB-NATIVE real Homebrew checksum rejection/install/update/retained-keg link rollback qualify selected native closure", async () => {
  expectSpawn(import.meta.path)
  if (!state.directory) throw new Error("HOMEBREW_FIXTURE_MISSING")
  const host = await sandbox(join(state.directory, "host-tools"))
  // The shared host proof verifies the actual machine and rejects Rosetta.
  await successful([process.execPath, "script/runtime-proof.ts", "--target", target, "--host"], { ...host, cwd: cli }, 15_000)
  const sdk = await successful(["/usr/bin/xcrun", "--sdk", "macosx", "--show-sdk-path"], host, 15_000)
  if (!isAbsolute(sdk)) throw new Error("HOMEBREW_DARWIN_SDK_UNAVAILABLE")
  const canonicalSDK = await realpath(sdk)
  if (!(await lstat(canonicalSDK)).isDirectory()) throw new Error("HOMEBREW_DARWIN_SDK_UNAVAILABLE")
  process.env.ORCHESTRA_ARTIFACT_DARWIN_SDK = canonicalSDK
  // HB-BUILDS: two actual canonical builds, admitted complete closure, captured skill bytes.
  const built = await buildVersions(state.directory)
  expect(built.payloads.map((payload) => payload.version)).toEqual(["1.18.27", "1.18.28"])
  await homebrewChannel(state.directory, built, () => { state.preserve = true })
}, 2_700_000)
