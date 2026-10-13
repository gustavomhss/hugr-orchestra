import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve, sep } from "node:path"
import { buildVersions, cli, snapshot } from "./fixture/distribution-native"
import type { Built } from "./fixture/distribution-native"
import { curlChannel } from "./fixture/distribution-native-curl"
import { npmChannel } from "./fixture/distribution-native-npm"
import { emergencyStop, stopServices } from "./fixture/distribution-native-proof"
import { requireDistributionHost } from "./fixture/distribution-host"
import { expectSpawn } from "../../core/test/fixture/omni-expect"

// Native qualification only. Hosted test-ci supplies installed build dependencies
// and real packages/omni/target/release companions through omni-binaries action.
// No synthetic native headers, spawner-off bypass, provider, brew or makepkg proof.
// Reach: compiled skill bundle vs captured source bytes, isolated HOME/cwd/cache.
// Checkout remains readable: this does not qualify a source-inaccessible OS sandbox.
const state: { directory?: string; built?: Built } = {}
const interrupt = () => { void stopServices().then(() => process.exit(1), () => process.exit(1)) }

beforeAll(async () => {
  requireDistributionHost()
  if (!process.env.RUNNER_OS) throw new Error("Native distribution qualification requires hosted test-ci RUNNER_OS")
  if (process.versions.bun !== "1.3.14") throw new Error("BUN_VERSION_MISMATCH: require 1.3.14")
  if (!["linux", "darwin"].includes(process.platform) || !["x64", "arm64"].includes(process.arch))
    throw new Error("NATIVE_POSIX_HOST_REQUIRED: linux/darwin x64 baseline or arm64")
  if (process.env.RUNNER_OS !== (process.platform === "linux" ? "Linux" : "macOS"))
    throw new Error("RUNNER_OS_HOST_MISMATCH")
  state.directory = await mkdtemp(join(await realpath(tmpdir()), "orchestra-distribution-native-"))
  expect(state.directory.startsWith((await realpath(resolve(cli, "../.."))) + sep)).toBe(false)
  process.once("exit", emergencyStop)
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  process.once("SIGHUP", interrupt)
  state.built = await buildVersions(state.directory)
}, 1_800_000)

afterAll(async () => {
  // Refuse deletion when stop fails; exit hook still has original launchers.
  await stopServices()
  process.off("exit", emergencyStop)
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", interrupt)
  process.off("SIGHUP", interrupt)
  if (state.directory) await rm(state.directory, { recursive: true, force: true })
}, 120_000)

function requireFixture() {
  if (!state.directory || !state.built) throw new Error("NATIVE_BUILD_FIXTURE_MISSING")
  return { directory: state.directory, built: state.built }
}

test("native curl HTTPS/sh install, update and rollback retain complete closures and qualify public launcher", async () => {
  expectSpawn(import.meta.path)
  const fixture = requireFixture()
  await curlChannel(fixture.directory, fixture.built)
  for (const payload of fixture.built.payloads) expect(await snapshot(payload.payload)).toEqual(payload.snapshot)
}, 600_000)

test("native npm pack/registry install, update and downgrade qualify public launcher and retained extracted roots", async () => {
  expectSpawn(import.meta.path)
  const fixture = requireFixture()
  await npmChannel(fixture.directory, fixture.built)
  for (const payload of fixture.built.payloads) expect(await snapshot(payload.payload)).toEqual(payload.snapshot)
}, 900_000)
