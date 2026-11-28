// AC-07/AC-10 controls for the native adapter. All producers, reviewers and authority in this
// file are explicitly synthetic fixtures; they are not campaign judge or publication evidence.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { Worker } from "node:worker_threads"
import { afterEach, describe, expect, it } from "vitest"
import { asHash, id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { readOwnership } from "@atlas/knowledge"
import type { OwnershipRead } from "@atlas/knowledge"
import { composeRuntime } from "../src/compose.js"
import { buildGate, deriveGroundingAxes } from "../src/grounding-computer.js"
import { walkFileTree } from "../src/fs.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { prepareNativePackage, publishNativePackage } from "../src/genesis-native.js"
import type { PreparedNativePackage } from "../src/genesis-native.js"
import type { NativeBinding } from "../src/genesis-native-binding.js"
import type { NativeArtifact, NativePackage } from "../src/genesis-native-format.js"
import { nativeBlobSha, nativeSha256 } from "../src/genesis-native-io.js"
import { loadPolicy } from "../src/policy.js"
import { headSha } from "../src/run-git.js"
import { readScipOrEmpty } from "../src/scip.js"
import { createDiskStore } from "../src/store.js"
import { gitStoreProvenance } from "../src/store-provenance.js"
import { ownershipFixture } from "./harness/ownership-fixture.js"

const prior = { actor: process.env.ATLAS_ACTOR, token: process.env.ATLAS_RATIFY_TOKEN }
const cleanups: (() => void)[] = []
const query = { scope: "core", need: "entry" as const, maxBytes: 4096 }
const independentQuery = { scope: "independent", need: "operational" as const, maxBytes: 4096 }
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  if (prior.actor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = prior.actor
  if (prior.token === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = prior.token
})

function fixture() {
  process.env.ATLAS_ACTOR = "synthetic-recovery-operator"
  process.env.ATLAS_RATIFY_TOKEN = "synthetic-recovery-ratifier"
  const base = ownershipFixture()
  cleanups.push(base.cleanup)
  const calls: string[] = []
  const write = (path: string, value: string) => {
    mkdirSync(dirname(join(base.repoPath, path)), { recursive: true })
    writeFileSync(join(base.repoPath, path), value, { flag: "wx" })
  }
  const reference = (path: string) => ({ payload_path: path, sha256: nativeSha256(readFileSync(join(base.repoPath, path))) })
  write("native/protocol.md", "Synthetic native-recovery contract.\n")
  write("protected/request.txt", "Synthetic original request, preserved.\n")
  write("protected/response.txt", "Synthetic original response, preserved.\n")
  const generate = (name: string) => {
    // Count only this explicit synthetic authoring callback. Resume must not call it again;
    // the count is not model telemetry, financial evidence or a cache/rebuild re-test.
    calls.push(name)
    const directory = `native/${name}`
    for (const label of ["recipe", "oracle", "request", "response", "semantic-a", "semantic-b"])
      write(`${directory}/${label}.md`, `Synthetic ${name} ${label}.\n`)
    const source = readFileSync(join(base.repoPath, "src/util.ts"))
    const artifact = (key: string, layer: 1 | 4, need: "evidence" | "entry"): NativeArtifact => {
      const body = `# ${name} ${key}\n\n## Use\nSynthetic completed ${name} ${key}.\n`
      write(`${directory}/${key}.md`, body)
      return {
        key, scope: "core", title: `${name} ${key}`, layer, need,
        body: { path: `${key}.md`, encoding: "utf-8", byte_length: Buffer.byteLength(body), sha256: nativeSha256(Buffer.from(body)) },
        authority: { scope: "core", basis: "Synthetic recovery fixture only" }, validity: "supported", gaps: [], evidence: ["synthetic-recovery"],
        input_keys: ["file:src/util.ts", `file:${directory}/recipe.md`],
        source_refs: [{ commit: "1".repeat(40), path: "src/util.ts", git_blob_sha: nativeBlobSha(source), sha256: nativeSha256(source) }],
        recipe_ref: reference(`${directory}/recipe.md`), build_dependencies: key === "entry" ? [{ key: "evidence", same_package: true }] : [], navigation: [],
        producer_request_ref: reference(`${directory}/request.md`), producer_response_ref: reference(`${directory}/response.md`),
        semantic_review_refs: [reference(`${directory}/semantic-a.md`), reference(`${directory}/semantic-b.md`)], runtime_receipt_refs: [],
      }
    }
    const pack: NativePackage = {
      schema: "genesis-native-package/v1", campaign: "synthetic-recovery", protocol_epoch: "fixture", results_epoch: "fixture", session: "S4",
      source_revision: "1".repeat(40), protocol_ref: reference("native/protocol.md"), scope: "core", package_state: "IN_PROGRESS",
      contract: { criteria: ["synthetic-recovery-binding"], oracle_ref: reference(`${directory}/oracle.md`) },
      required_artifact_keys: ["evidence", "entry"], artifacts: [artifact("evidence", 1, "evidence"), artifact("entry", 4, "entry")],
      roots: { entry: "entry" }, missing_required_artifact_keys: [], known_limits: ["Synthetic test fixture, not judge evidence"],
    }
    const packagePath = `${directory}/native-package.json`
    write(packagePath, JSON.stringify(pack))
    const prepared = prepareNativePackage(base.repoPath, packagePath)
    const preparedPath = `${directory}/prepared.json`
    write(preparedPath, JSON.stringify(prepared))
    write(`${directory}/binding-request.json`, JSON.stringify(prepared))
    const reviewers = ["synthetic-recovery-judge-a", "synthetic-recovery-judge-b"]
    const decisions = reviewers.map((reviewer, index) => {
      const responsePath = `${directory}/binding-response-${index}.txt`
      write(responsePath, `Synthetic binding record ${reviewer} ${prepared.candidate_id}.\n`)
      const response = reference(responsePath)
      return {
        reviewer, decision_id: `sha256:${response.sha256}`, decision_id_kind: "response-sha256" as const, purpose: "runtime-import-binding" as const,
        candidate_id: prepared.candidate_id, contract: prepared.candidate.contract, verdict: "PASS" as const,
        criteria: prepared.candidate.criteria.map((id) => ({ id, verdict: "PASS" as const })),
        entries: prepared.candidate.entries.map((entry) => ({ key: entry.key, result: entry.artifact.result, inputs: entry.inputs_id })),
        request_ref: reference(`${directory}/binding-request.json`), response_ref: response,
      }
    })
    const binding: NativeBinding = { schema: "genesis-native-binding-approval/v1", purpose: "runtime-import-binding", candidate_id: prepared.candidate_id, contract: prepared.candidate.contract, reviewers, decisions }
    const approvalPath = `${directory}/approval.json`
    write(approvalPath, JSON.stringify(binding))
    return { prepared, preparedPath, approvalPath, packagePath, directory, pack }
  }
  const activate = (ownership: Hash, atBoundary: () => string | undefined) => {
    const provenance = gitStoreProvenance(base.repoPath)
    const disk = createDiskStore(join(base.repoPath, ".atlas/cas"), atBoundary, () => provenance() === "trusted")
    const axes = deriveGroundingAxes(walkFileTree(base.repoPath), readScipOrEmpty(join(base.repoPath, ".atlas/index.scip"))).axes
    return createGovernedEmit({ store: disk, gate: buildGate(axes), policy: loadPolicy(base.repoPath), actor: "synthetic-recovery-operator", ratifyToken: "synthetic-recovery-ratifier", ownershipInput: base.current })
      .emit(base.carrier(ownership), id({ fixture: "native-recovery-activation", ownership }))
  }
  const publishIndependent = () => {
    const independent = base.artifact("## Use\nIndependent accepted fixture.\n", [{ key: "file:api/service.py", version: base.current("file:api/service.py")! }], { scope: "independent" })
    expect(base.runtime().handler.handle("atlas-emit", { node: base.carrier(independent.manifestRef, "independent", "api/service.py"), at: id({ fixture: "independent" }) }).data).toMatchObject({ emitted: true })
    return independent.manifestRef
  }
  return { ...base, calls, write, generate, activate, publishIndependent }
}

type Generation = ReturnType<ReturnType<typeof fixture>["generate"]>
const reopen = (repo: string, generation: Generation) => JSON.parse(readFileSync(join(repo, generation.preparedPath), "utf8")) as PreparedNativePackage
const projectionBytes = (repo: string) => new Map(readdirSync(join(repo, ".atlas")).filter((name) => /^projection(?:\.\d+)?\.json$/.test(name)).sort().map((name) => [name, readFileSync(join(repo, ".atlas", name), "utf8")]))
const bytesOf = (repo: string, paths: string[]) => paths.map((path) => [path, readFileSync(join(repo, path), "utf8")])

async function assembleWithoutActivating(repo: string, generation: Generation): Promise<Hash> {
  const token = process.env.ATLAS_RATIFY_TOKEN
  delete process.env.ATLAS_RATIFY_TOKEN
  try {
    const held = await publishNativePackage(repo, reopen(repo, generation), generation.approvalPath)
    expect(held).toMatchObject({ kind: "hold", stage: "governed-check" })
    return held.ownership
  } finally {
    if (token === undefined) delete process.env.ATLAS_RATIFY_TOKEN
    else process.env.ATLAS_RATIFY_TOKEN = token
  }
}

type Sample = { before: number; after: number; mainStarted: string; mainFinished: string; main: OwnershipRead; independent: OwnershipRead }
type ReaderMessage = { kind: "ready" } | { kind: "trace"; samples: Sample[] } | { kind: "failure"; message: string }
function concurrentReader(repo: string, wanted: Hash) {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 3))
  // The remote workflow builds exports before Vitest. The worker loads that same candidate's real
  // runtime in a separate isolate; it does not share a store double or a cached test response.
  const compose = new URL("../dist/src/compose.js", import.meta.url)
  if (!existsSync(compose)) throw new Error("Build Atlas exports before the native recovery reader control")
  const worker = new Worker(`
    const { parentPort, workerData } = require("node:worker_threads");
    (async () => {
      const { composeRuntime } = await import(workerData.compose);
      const runtime = composeRuntime(workerData.repo);
      const state = new Int32Array(workerData.buffer);
      const samples = [];
      const deadline = Date.now() + 15000;
      function sample() {
        const before = Atomics.load(state, 0);
        const mainStarted = process.hrtime.bigint().toString();
        const main = runtime.ownership.read(workerData.query);
        const mainFinished = process.hrtime.bigint().toString();
        const independent = runtime.ownership.read(workerData.independentQuery);
        const after = Atomics.load(state, 0);
        samples.push({ before, after, mainStarted, mainFinished, main, independent });
        if (before === 1 && after === 1) { Atomics.add(state, 1, 1); Atomics.notify(state, 1); }
        if (main.kind === "ready" && main.manifest === workerData.wanted) { Atomics.store(state, 2, 1); Atomics.notify(state, 2); }
      }
      sample();
      parentPort.postMessage({ kind: "ready" });
      while (Atomics.load(state, 0) !== 3 && Date.now() < deadline && samples.length < 5000) sample();
      if (Atomics.load(state, 0) !== 3) throw new Error("concurrent reader exhausted its explicit bound");
      parentPort.postMessage({ kind: "trace", samples });
    })().catch(error => parentPort.postMessage({ kind: "failure", message: String(error) }));
  `, { eval: true, workerData: { compose: compose.href, repo, buffer: signal.buffer, query, independentQuery, wanted } })
  const ready = new Promise<void>((resolve, reject) => {
    worker.once("message", (message: ReaderMessage) => message.kind === "ready" ? resolve() : reject(new Error("reader did not start")))
    worker.once("error", reject)
  })
  const trace = new Promise<Sample[]>((resolve, reject) => {
    let delivered = false
    worker.on("message", (message: ReaderMessage) => {
      if (message.kind === "failure") { delivered = true; reject(new Error(message.message)) }
      if (message.kind === "trace") { delivered = true; resolve(message.samples) }
    })
    worker.once("error", reject)
    worker.once("exit", (code) => { if (!delivered) reject(new Error(`reader exited without trace: ${code}`)) })
  })
  void trace.catch(() => undefined) // The awaited original promise still fails; handle errors while the writer is in its synchronous barrier.
  return { signal, worker, ready, trace }
}

function waitFor(signal: Int32Array, index: number, minimum: number) {
  const deadline = Date.now() + 5000
  for (;;) {
    const current = Atomics.load(signal, index)
    if (current >= minimum) return
    if (Atomics.wait(signal, index, current, Math.max(1, deadline - Date.now())) === "timed-out" && Atomics.load(signal, index) < minimum)
      throw new Error("reader/writer barrier timed out")
  }
}

describe("Genesis native durable recovery and preservation", () => {
  it("NR1-01 interruption before activation leaves HOLD or the valid old manifest; resume reuses durable candidate/CAS", async () => {
    const f = fixture()
    const reader = composeRuntime(f.repoPath)
    const first = f.generate("first")
    const firstBytes = readFileSync(join(f.repoPath, first.preparedPath), "utf8")
    const firstManifest = await assembleWithoutActivating(f.repoPath, first)
    expect(() => f.activate(firstManifest, () => { throw new Error("synthetic-before-activation-interruption") })).toThrow("synthetic-before-activation-interruption")
    expect(reader.ownership.read(query).kind).toBe("hold")
    expect(createDiskStore(join(f.repoPath, ".atlas/cas")).get(first.prepared.candidate_id)).toEqual(first.prepared.candidate)
    expect(await publishNativePackage(f.repoPath, reopen(f.repoPath, first), first.approvalPath)).toMatchObject({ kind: "publication-attempt", emission: { data: { emitted: true } } })
    expect(reader.ownership.read(query)).toMatchObject({ kind: "ready", manifest: firstManifest, historical: false })
    expect(f.calls).toEqual(["first"])
    const second = f.generate("second")
    const secondManifest = await assembleWithoutActivating(f.repoPath, second)
    const before = projectionBytes(f.repoPath)
    expect(() => f.activate(secondManifest, () => { throw new Error("synthetic-before-activation-interruption") })).toThrow("synthetic-before-activation-interruption")
    expect(projectionBytes(f.repoPath)).toEqual(before)
    expect(reader.ownership.read(query)).toMatchObject({ kind: "ready", manifest: firstManifest })
    expect(await publishNativePackage(f.repoPath, reopen(f.repoPath, second), second.approvalPath)).toMatchObject({ kind: "publication-attempt", emission: { data: { emitted: true } } })
    expect(reader.ownership.read(query)).toMatchObject({ kind: "ready", manifest: secondManifest })
    expect(f.calls).toEqual(["first", "second"])
    expect(readFileSync(join(f.repoPath, first.preparedPath), "utf8")).toBe(firstBytes)
  })

  it("NR1-02 failed activation after source drift serves HOLD; incompatible rollback is refused and historical reads stay explicit", async () => {
    const f = fixture()
    const old = f.generate("old")
    const published = await publishNativePackage(f.repoPath, old.prepared, old.approvalPath)
    expect(published).toMatchObject({ kind: "publication-attempt", emission: { data: { emitted: true } } })
    const independent = f.publishIndependent()
    const protectedPaths = ["protected/request.txt", "protected/response.txt", old.packagePath, old.preparedPath, old.approvalPath, `${old.directory}/entry.md`]
    const protectedBefore = bytesOf(f.repoPath, protectedPaths)
    const oldCas = readFileSync(join(f.repoPath, ".atlas/cas", published.ownership.slice(0, 2), published.ownership), "utf8")
    writeFileSync(join(f.repoPath, "src/util.ts"), "export const changedRecoverySource = true\n")
    const next = f.generate("updated")
    const nextManifest = await assembleWithoutActivating(f.repoPath, next)
    expect(() => f.activate(nextManifest, () => { throw new Error("synthetic-failed-drift-activation") })).toThrow("synthetic-failed-drift-activation")
    const reader = composeRuntime(f.repoPath)
    expect(reader.ownership.read(query)).toMatchObject({ kind: "hold", reason: "ownership-input-changed" })
    expect(reader.ownership.read({ ...query, historical: true })).toMatchObject({ kind: "ready", manifest: published.ownership, historical: true })
    expect(reader.ownership.read(independentQuery)).toMatchObject({ kind: "ready", manifest: independent })
    expect(await publishNativePackage(f.repoPath, reopen(f.repoPath, next), next.approvalPath)).toMatchObject({ kind: "publication-attempt", emission: { data: { emitted: true } } })
    const beforeRollback = projectionBytes(f.repoPath)
    await expect(publishNativePackage(f.repoPath, reopen(f.repoPath, old), old.approvalPath)).rejects.toThrow("native-source-drift")
    await expect(publishNativePackage(f.repoPath, reopen(f.repoPath, next), old.approvalPath)).rejects.toThrow("native-binding-candidate")
    expect(f.runtime().handler.handle("atlas-emit", { node: f.carrier(published.ownership), at: id({ fixture: "incompatible-rollback" }) }).data).toMatchObject({ emitted: false, rejected: expect.stringContaining("ownership-input-changed") })
    expect(projectionBytes(f.repoPath)).toEqual(beforeRollback)
    expect(reader.ownership.read(query)).toMatchObject({ kind: "ready", manifest: nextManifest, historical: false })
    expect(reader.ownership.read(independentQuery)).toMatchObject({ kind: "ready", manifest: independent })
    expect(readOwnership(createDiskStore(join(f.repoPath, ".atlas/cas")), published.ownership, { ...query, historical: true }, f.current)).toMatchObject({ kind: "ready", historical: true })
    expect(bytesOf(f.repoPath, protectedPaths)).toEqual(protectedBefore)
    expect(readFileSync(join(f.repoPath, ".atlas/cas", published.ownership.slice(0, 2), published.ownership), "utf8")).toBe(oldCas)
  })

  it("NR1-03 stale transport, scope rebinding and old approval cannot replace the new accepted scope", async () => {
    const f = fixture()
    const old = f.generate("legacy")
    const current = f.generate("accepted")
    const published = await publishNativePackage(f.repoPath, current.prepared, current.approvalPath)
    expect(published).toMatchObject({ kind: "publication-attempt", emission: { data: { emitted: true } } })
    const independent = f.publishIndependent()
    const before = projectionBytes(f.repoPath)
    const obsolete = { ...old.pack, schema: "genesis-native-package/v0" }
    f.write("native/obsolete.json", JSON.stringify(obsolete))
    expect(() => prepareNativePackage(f.repoPath, "native/obsolete.json")).toThrow("native-schema")
    f.write("native/rebound.json", JSON.stringify({ ...old.pack, scope: "new-accepted-scope" }))
    expect(() => prepareNativePackage(f.repoPath, "native/rebound.json")).toThrow("native-artifact-scope")
    await expect(publishNativePackage(f.repoPath, current.prepared, old.approvalPath)).rejects.toThrow("native-binding-candidate")
    const oldTransportWithNewID = { ...old.prepared, candidate_id: current.prepared.candidate_id }
    await expect(publishNativePackage(f.repoPath, oldTransportWithNewID, current.approvalPath)).rejects.toThrow("native-candidate-drift")
    const legacy = f.artifact("Synthetic legacy producer output.\n", [], { scope: "independent" })
    expect(f.runtime().handler.handle("atlas-emit", { node: f.carrier(legacy.manifestRef, "independent"), at: id({ fixture: "legacy-relocation" }) }).data)
      .toMatchObject({ emitted: false, rejected: expect.stringContaining("relocat") })
    expect(projectionBytes(f.repoPath)).toEqual(before)
    expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "ready", manifest: published.ownership })
    expect(f.runtime().ownership.read(independentQuery)).toMatchObject({ kind: "ready", manifest: independent })
    // This is exact input/contract/scope binding, not a nonexistent chronological producer-version
    // fence. Re-publishing a fully valid historical candidate is a separate compatible rollback act.
  })

  it("NR1-04 a separate reader overlaps real sidecar activation and sees only complete accepted manifests", async () => {
    const f = fixture()
    const old = f.generate("concurrent-old")
    const oldPublication = await publishNativePackage(f.repoPath, old.prepared, old.approvalPath)
    expect(oldPublication).toMatchObject({ kind: "publication-attempt", emission: { data: { emitted: true } } })
    const independent = f.publishIndependent()
    const next = f.generate("concurrent-new")
    const nextManifest = await assembleWithoutActivating(f.repoPath, next)
    const expected = new Map([oldPublication.ownership, nextManifest].map((manifest) => [manifest, readOwnership(f.store, manifest, query, f.current)]))
    const reader = concurrentReader(f.repoPath, nextManifest)
    try {
      await reader.ready
      const activation = { start: 0n, end: 0n }
      const emitted = f.activate(nextManifest, () => {
        // Existing head-watermark callback is inside sidecar publish(), after durable CAS puts and
        // before activation. It blocks until a real worker read has completed inside this interval.
        Atomics.store(reader.signal, 0, 1)
        waitFor(reader.signal, 1, Atomics.load(reader.signal, 1) + 1)
        const observedHead = headSha(f.repoPath)
        activation.start = process.hrtime.bigint()
        return observedHead
      })
      activation.end = process.hrtime.bigint()
      Atomics.store(reader.signal, 0, 2)
      expect(emitted.emitted).toBe(true)
      waitFor(reader.signal, 2, 1)
      Atomics.store(reader.signal, 0, 3)
      const samples = await reader.trace
      expect(samples.some((sample) => sample.before === 1 && sample.after === 1)).toBe(true)
      // Anti-vacuity: a read invocation must overlap the actual serialization/link/commit interval
      // after the barrier releases, not merely the paused callback or a post-commit reopen.
      expect(activation.start > 0n && activation.end > activation.start).toBe(true)
      expect(samples.some((sample) => BigInt(sample.mainStarted) < activation.end && BigInt(sample.mainFinished) > activation.start)).toBe(true)
      const seen = new Set<string>()
      for (const sample of samples) {
        expect(sample.independent).toMatchObject({ kind: "ready", manifest: independent, historical: false })
        if (sample.main.kind === "hold") continue
        seen.add(sample.main.manifest)
        expect(sample.main).toEqual(expected.get(asHash(sample.main.manifest)))
      }
      expect(seen).toEqual(new Set([oldPublication.ownership, nextManifest]))
    } finally {
      Atomics.store(reader.signal, 0, 3)
      await reader.worker.terminate()
      await reader.trace.catch(() => undefined)
    }
  }, 25000)
})
