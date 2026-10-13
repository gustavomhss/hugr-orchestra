import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve, sep } from "node:path"
import { buildVersions, captureOracle, cli, snapshot, target } from "./fixture/distribution-native"
import type { Built } from "./fixture/distribution-native"
import { npmChannel } from "./fixture/distribution-native-npm"
import { emergencyStop, stopServices } from "./fixture/distribution-native-proof"
import { assertWindowsPE, windowsIdentity } from "./fixture/distribution-windows-process"
import { expectSpawn } from "../../core/test/fixture/omni-expect"
import { namedTargets } from "../script/targets"

// Native windows-latest x64 only, matching windows-x64-baseline builder row.
// Requires Bun 1.3.14, native Node >=22 (stripTypeScriptTypes), PowerShell 7,
// tar.exe, frozen workspace dependencies incl. native tree-sitter, and real
// release omni DLL/supervisor from omni-binaries action. No unavailable skips.
// Host HUGR_OMNI_* feeds harness only; sandbox removes all companion overrides.
// Source checkout stays readable; source CLI is never a launcher fallback.
const state: { directory?: string; built?: Built } = {}
const interrupt = () => { void stopServices().then(() => process.exit(1), () => process.exit(1)) }

beforeAll(async () => {
  if (process.platform !== "win32" || process.arch !== "x64" || process.env.RUNNER_OS !== "Windows" ||
      process.env.RUNNER_ENVIRONMENT !== "github-hosted")
    throw new Error("NATIVE_WINDOWS_HOST_REQUIRED: hosted windows-latest x64")
  if (process.versions.bun !== "1.3.14") throw new Error("BUN_VERSION_MISMATCH: require 1.3.14")
  expect(target).toBe("windows-x64-baseline")
  expect(namedTargets.find((item) => item.target === target)).toMatchObject({ os: "win32", arch: "x64", avx2: false })
  // Query must see this live PE before it may prove detached daemon absence.
  expect((await windowsIdentity(process.pid))?.pid).toBe(process.pid)
  state.directory = await mkdtemp(join(await realpath(tmpdir()), "nw-"))
  expect(state.directory.toLowerCase().startsWith((await realpath(resolve(cli, "../.."))).toLowerCase() + sep)).toBe(false)
  process.once("exit", emergencyStop)
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  state.built = await buildVersions(state.directory)
  for (const payload of state.built.payloads) {
    await assertWindowsPE(join(payload.payload, "bin/orchestra.exe"), false)
    await assertWindowsPE(join(payload.payload, "bin/hugr-omni-supervisor.exe"), false)
    const bindings = payload.manifest.files.filter((file) => file.path.endsWith(".node"))
    expect(bindings.length).toBeGreaterThan(1)
    for (const binding of bindings) await assertWindowsPE(join(payload.payload, binding.path), true)
    expect(await snapshot(payload.payload)).toEqual(payload.snapshot)
  }
  expect((await captureOracle()).trees).toEqual(state.built.oracle.trees)
}, 1_800_000)

afterAll(async () => {
  // Any failed/unproved daemon join keeps original fixture and emergency hook.
  await stopServices()
  process.off("exit", emergencyStop)
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", interrupt)
  if (state.directory) await rm(state.directory, { recursive: true, force: true })
}, 120_000)

test("native Windows npm install, update and exact downgrade qualify PE closure, public CMD launcher and owned daemon exit", async () => {
  expectSpawn(import.meta.path)
  if (!state.directory || !state.built) throw new Error("NATIVE_WINDOWS_BUILD_FIXTURE_MISSING")
  await npmChannel(state.directory, state.built)
  for (const payload of state.built.payloads) expect(await snapshot(payload.payload)).toEqual(payload.snapshot)
  expect((await captureOracle()).trees).toEqual(state.built.oracle.trees)
}, 900_000)
