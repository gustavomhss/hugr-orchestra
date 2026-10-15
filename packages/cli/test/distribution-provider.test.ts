import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve, sep } from "node:path"
import { buildVersions, cli, sha256, snapshot, versions } from "./fixture/distribution-native"
import type { Built } from "./fixture/distribution-native"
import { npmChannel } from "./fixture/distribution-native-npm"
import { stopServices } from "./fixture/distribution-native-proof"
import { model, modelDigest, image, ownedOllama } from "./fixture/distribution-provider-ollama"
import type { OwnedOllama } from "./fixture/distribution-provider-ollama"
import { qualifyProvider } from "./fixture/distribution-provider-proof"
import { stopProviderDaemons } from "./fixture/distribution-provider-daemon"
import { requireV2CompilerProvenance } from "./fixture/distribution-provider-sourcegraph"
import type { CompilerReceipts } from "./fixture/distribution-provider-sourcegraph"
import { exportProviderEvidence, markProviderEvidence } from "./fixture/distribution-provider-evidence"
import { expectSpawn } from "../../core/test/fixture/omni-expect"

// Lead registers this file only on hosted Ubuntu x64. No local execution, skip,
// emulation, credential-dependent provider, fake inference or source CLI fallback.
// Runtime qualification remains pending until all actual controls execute in CI.
const state: { directory?: string; evidence?: string; built?: Built; compiler?: CompilerReceipts; ollama?: OwnedOllama; cleanup?: Promise<void>; controlsComplete?: string[] } = {}
const owner = randomUUID()
const interrupt = () => { void cleanup().then(() => process.exit(1), () => process.exit(1)) }

beforeAll(async () => {
  const evidence = await mkdtemp(join(await realpath(tmpdir()), "orchestra-distribution-provider-evidence-"))
  state.evidence = evidence
  await markProviderEvidence(evidence, owner)
  await (async () => {
    if (process.env.RUNNER_OS !== "Linux" || process.env.RUNNER_ARCH !== "X64" ||
        process.platform !== "linux" || process.arch !== "x64") throw new Error("PROVIDER_HOSTED_UBUNTU_X64_REQUIRED")
    if (process.versions.bun !== "1.3.14") throw new Error("BUN_VERSION_MISMATCH: require 1.3.14")
    if (!(await readFile("/etc/os-release", "utf8")).split("\n").some((line) => /^ID=(?:ubuntu|"ubuntu")$/.test(line)))
      throw new Error("PROVIDER_NATIVE_UBUNTU_REQUIRED")
    state.directory = await mkdtemp(join(await realpath(tmpdir()), "orchestra-distribution-provider-"))
    expect(state.directory.startsWith((await realpath(resolve(cli, "../.."))) + sep)).toBe(false)
    await Bun.write(join(state.directory, ".owner"), owner)
    console.error(`DISTRIBUTION_PROVIDER_ARTIFACTS ${state.evidence}`)
    process.once("SIGINT", interrupt)
    process.once("SIGTERM", interrupt)
    process.once("SIGHUP", interrupt)
    // Register ownership before setup can fail. Cleanup never touches host Ollama.
    state.ollama = await ownedOllama(state.directory, evidence)
    await state.ollama.start()
    state.built = await buildVersions(state.directory)
    state.compiler = await requireV2CompilerProvenance(state.built, evidence)
    await Bun.write(join(evidence, "setup.json"), JSON.stringify({ owner, status: "ready", versions: state.compiler.map((entry) => entry.version) }))
  })().catch(async (error: unknown) => {
    await Bun.write(join(evidence, "setup.json"), JSON.stringify({ owner, status: "failed",
      error: error instanceof Error ? error.message : String(error) }))
    throw error
  }).finally(() => exportProviderEvidence(evidence, owner))
}, 2_400_000)

afterAll(async () => {
  await cleanup()
  process.off("SIGINT", interrupt)
  process.off("SIGTERM", interrupt)
  process.off("SIGHUP", interrupt)
}, 180_000)

function cleanup() {
  state.cleanup ??= (async () => {
    const results = await Promise.allSettled([stopServices(), stopProviderDaemons(), state.ollama?.stop()])
    const failed = results.filter((result) => result.status === "rejected")
    const failures: unknown[] = failed.map((result) => result.reason)
    const stopped = results[0]?.status === "fulfilled" && results[1]?.status === "fulfilled" && (state.ollama?.cleaned() ?? true)
    await (async () => {
      if (!state.directory || !stopped) return
      const info = await lstat(state.directory)
      if (!info.isDirectory() || info.isSymbolicLink() || await readFile(join(state.directory, ".owner"), "utf8") !== owner)
        throw new Error("PROVIDER_FIXTURE_OWNERSHIP_CHANGED")
      expect(await realpath(state.directory)).toBe(state.directory)
      await rm(state.directory, { recursive: true })
      const remaining = await lstat(state.directory).then(() => true, (error: unknown) => {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false
        throw error
      })
      expect(remaining).toBe(false)
      if (state.evidence) await Bun.write(join(state.evidence, "fixture-cleanup.json"), JSON.stringify({
        owner, directory: state.directory, ownedContainerStoppedAndRemoved: true, ownedDaemonsStopped: true,
        fixtureRemoved: true, evidenceRetained: state.evidence,
      }, null, 2))
      if (!failures.length && state.controlsComplete && state.evidence) await Bun.write(join(state.evidence, "qualified.json"), JSON.stringify({
        status: "qualified", image, model, modelDigest, admitted: state.controlsComplete,
        controls: ["real-inference", "native-cpu", "outside-cwd-nonce", "real-tool-result-continuation",
          "exact-wire-bash-tool-result", "nonce-only-wire-oracle-mutation", "installed-platform-wrapper-preserved",
          "terminal-assistant", "durable-user-assistant-tool", "exact-installed-supervisor-chain", "fault-blocked", "restored",
          "installed-addon-maps-identity", "compiler-entry-dispatch-binary-binding", "owned-container-stopped-removed", "owned-fixture-removed"],
      }, null, 2))
      console.error(`DISTRIBUTION_PROVIDER_FIXTURE_REMOVED ${state.directory}`)
    })().catch((error: unknown) => { failures.push(error) })
    if (!state.evidence) failures.push(new Error("PROVIDER_SETUP_EVIDENCE_MISSING"))
    if (state.evidence) {
      await Bun.write(join(state.evidence, "cleanup-status.json"), JSON.stringify({ owner, stopped,
        failures: failures.map((error) => error instanceof Error ? error.message : String(error)) }))
        .catch((error: unknown) => { failures.push(error) })
      await exportProviderEvidence(state.evidence, owner).catch((error: unknown) => { failures.push(error) })
    }
    if (failures.length) throw new AggregateError(failures, "PROVIDER_OWNED_CLEANUP_FAILED")
  })()
  return state.cleanup
}

test("npm-installed public service/api drives Session V2 inference, installed-supervisor shell and real continuation across install/update/downgrade", async () => {
  expectSpawn(import.meta.path)
  if (!state.directory || !state.evidence || !state.built || !state.compiler || !state.ollama) throw new Error("PROVIDER_BUILD_FIXTURE_MISSING")
  const fixture = { directory: state.directory, evidence: state.evidence, built: state.built, compiler: state.compiler, ollama: state.ollama }
  const admitted: string[] = []
  await npmChannel(fixture.directory, fixture.built, async (installed) => {
    const stage = `installed-${admitted.length + 1}-${installed.version}`
    const compiler = fixture.compiler.find((entry) => entry.version === installed.version)
    if (!compiler) throw new Error("PROVIDER_INSTALLED_COMPILER_RECEIPT_MISSING")
    const wrapper = resolve(installed.payload, "../cli")
    const platformBefore = await snapshot(installed.payload)
    const wrapperBefore = await snapshot(wrapper)
    if (!platformBefore || !wrapperBefore) throw new Error("PROVIDER_INSTALLED_CLOSURE_SNAPSHOT_MISSING")
    await qualifyProvider({ ...installed, stage, compiler, evidence: fixture.evidence, ollama: fixture.ollama }).finally(async () => {
      // Compare complete installed bytes, executable flags, real-file types and
      // inventory (including empty directories) before npm can replace this tree.
      expect(await snapshot(installed.payload), `${stage}: installed platform payload changed`).toEqual(platformBefore)
      expect(await snapshot(wrapper), `${stage}: installed public wrapper changed`).toEqual(wrapperBefore)
      await Bun.write(join(fixture.evidence, `${stage}-installed-closure.json`), JSON.stringify({
        stage, version: installed.version, platform: installed.payload, wrapper,
        platformFiles: [...platformBefore.files].map(([path, file]) => ({ path, sha256: sha256(file.bytes), executable: file.executable })),
        wrapperFiles: [...wrapperBefore.files].map(([path, file]) => ({ path, sha256: sha256(file.bytes), executable: file.executable })),
        platformDirectories: platformBefore.directories, wrapperDirectories: wrapperBefore.directories,
        completeSnapshotsEqual: true,
      }, null, 2))
    })
    admitted.push(installed.version)
  }).catch(async (error: unknown) => {
    const failure = error instanceof Error ? error.message : String(error)
    await Bun.write(join(fixture.evidence, "pending.json"), JSON.stringify({
      status: "pending", image, model, modelDigest, admitted, failure,
      recommendation: "Inspect Session V2 admission/context/history, real requests/responses and installed daemon/supervisor oracle. If qwen3:0.6b lacks reliable tool use within budget, keep qualification pending and ask lead to approve a stronger pinned model; do not substitute scripted output.",
    }, null, 2))
    throw error
  })
  expect(admitted).toEqual([versions[0], versions[1], versions[0]])
  for (const payload of fixture.built.payloads) expect(await snapshot(payload.payload)).toEqual(payload.snapshot)
  await Bun.write(join(fixture.evidence, "controls-complete.json"), JSON.stringify({
    status: "controls-complete-cleanup-pending", image, model, modelDigest, admitted,
  }, null, 2))
  state.controlsComplete = admitted
}, 1_800_000)
