import { execFileSync } from "node:child_process"
import { appendKnowledge } from "../src/knowledge-log.js"
import { replayKnowledge } from "../src/knowledge-replay.js"
import { createGovernedPromote } from "../src/governed-promote.js"
import { createGovernedLink } from "../src/governed-link.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { loadPolicy } from "../src/policy.js"
import type { GroundedFact } from "@atlas/knowledge"
import { assembleHandler } from "../src/wire.js"
import { mkdirSync, lstatSync, readlinkSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { asHash, asNodeKey, id } from "@atlas/kernel"
import { prepareNativePackage, publishNativePackage } from "../src/genesis-native.js"
import type { PreparedNativePackage } from "../src/genesis-native.js"
import { validateNativeBinding } from "../src/genesis-native-binding.js"
import type { NativeBinding } from "../src/genesis-native-binding.js"
import { nativeRecord, validateNativePackage, validateNativeReadQuery } from "../src/genesis-native-format.js"
import type { NativeArtifact, NativePackage } from "../src/genesis-native-format.js"
import { nativeBlobSha, nativeSha256 } from "../src/genesis-native-io.js"
import { ownershipInputMaxBytes } from "../src/ownership-input.js"
import { ownershipFixture } from "./harness/ownership-fixture.js"

const prior = { actor: process.env.ATLAS_ACTOR, token: process.env.ATLAS_RATIFY_TOKEN }
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  if (prior.actor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = prior.actor
  if (prior.token === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = prior.token
})

/** Existing isolated policy/SCIP/Git fixture. All review identities and responses below are
 * synthetic TEST DATA, never runtime release evidence or claims of independent judgment. */
function fixture() {
  process.env.ATLAS_ACTOR = "alice"
  delete process.env.ATLAS_RATIFY_TOKEN
  const base = ownershipFixture()
  cleanups.push(base.cleanup)
  const write = (path: string, content: string | Uint8Array) => {
    mkdirSync(dirname(join(base.repoPath, path)), { recursive: true })
    writeFileSync(join(base.repoPath, path), content)
  }
  const reference = (path: string) => ({ payload_path: path, sha256: nativeSha256(readFileSync(join(base.repoPath, path))) })
  for (const name of ["recipe", "protocol", "oracle", "request", "response", "semantic-a", "semantic-b"])
    write(`native/${name}.md`, `Synthetic test evidence: ${name}.\n`)
  write("src/native-nav.ts", "export const nativeNavigation = 1\n")
  const artifact = (key: string, path: string, layer: NativeArtifact["layer"], need: NativeArtifact["need"], sourcePath: string): NativeArtifact => {
    const body = new TextEncoder().encode(`\ufeff# Native fixture\r\n## Use\r\nCafe\u0301: ${key}.\r\n`)
    write(`native/${path}`, body)
    const source = readFileSync(join(base.repoPath, sourcePath))
    return {
      key, scope: "core", title: key, layer, need,
      body: { path, encoding: "utf-8", byte_length: body.length, sha256: nativeSha256(body) },
      authority: { scope: "core", basis: "Explicit synthetic test fixture" }, validity: "supported", gaps: [], evidence: ["test-fixture"],
      input_keys: [`file:${sourcePath}`, "file:native/recipe.md"],
      source_refs: [{ commit: "1".repeat(40), path: sourcePath, git_blob_sha: nativeBlobSha(source), sha256: nativeSha256(source) }],
      recipe_ref: reference("native/recipe.md"), build_dependencies: [], navigation: [],
      producer_request_ref: reference("native/request.md"), producer_response_ref: reference("native/response.md"),
      semantic_review_refs: [reference("native/semantic-a.md"), reference("native/semantic-b.md")], runtime_receipt_refs: [],
    }
  }
  const pack: NativePackage = {
    schema: "genesis-native-package/v1", campaign: "fixture", protocol_epoch: "fixture", results_epoch: "fixture", session: "S4",
    source_revision: "1".repeat(40), protocol_ref: reference("native/protocol.md"), scope: "core", package_state: "IN_PROGRESS",
    contract: { criteria: ["fixture-source-binding"], oracle_ref: reference("native/oracle.md") },
    required_artifact_keys: ["evidence", "entry", "navigation"],
    artifacts: [artifact("evidence", "bodies/evidence.md", 1, "evidence", "src/util.ts"), artifact("entry", "bodies/entry.md", 4, "entry", "src/util.ts"), artifact("navigation", "bodies/navigation.md", 2, "component", "src/native-nav.ts")],
    roots: { entry: "entry" }, missing_required_artifact_keys: [], known_limits: ["Synthetic test data only"],
  }
  pack.artifacts[1]!.build_dependencies = [{ key: "evidence", same_package: true }]
  pack.artifacts[1]!.navigation = ["navigation"]
  const save = () => write("native/native-package.json", JSON.stringify(pack))
  const prepare = () => { save(); return prepareNativePackage(base.repoPath, "native/native-package.json") }
  const approval = (prepared: PreparedNativePackage): NativeBinding => {
    write("native/binding-request.json", JSON.stringify(prepared))
    const reviewers = ["synthetic-fixture-reviewer-a", "synthetic-fixture-reviewer-b"]
    return {
      schema: "genesis-native-binding-approval/v1", purpose: "runtime-import-binding",
      candidate_id: prepared.candidate_id, contract: prepared.candidate.contract, reviewers,
      decisions: reviewers.map((reviewer, index) => {
        write(`native/binding-response-${index}.txt`, `Synthetic binding fixture for ${reviewer}; ${prepared.candidate_id}.\n`)
        return {
          reviewer, decision_id: `sha256:${reference(`native/binding-response-${index}.txt`).sha256}`, decision_id_kind: "response-sha256", purpose: "runtime-import-binding", candidate_id: prepared.candidate_id,
          contract: prepared.candidate.contract, verdict: "PASS", criteria: prepared.candidate.criteria.map((id) => ({ id, verdict: "PASS" })),
          entries: prepared.candidate.entries.map((entry) => ({ key: entry.key, result: entry.artifact.result, inputs: entry.inputs_id })),
          request_ref: reference("native/binding-request.json"), response_ref: reference(`native/binding-response-${index}.txt`),
        }
      }),
    }
  }
  return { ...base, write, pack, prepare, save, approval }
}

import { cpSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { prepareEvaluation, admitEvaluation, admitEvaluationRebuildTarget } from "../src/genesis-evaluation.js"
import { initializeEvaluationStore, loadEvaluationAccess } from "../src/ownership-evaluation-policy.js"
import { composeRuntime } from "../src/compose.js"
import { prepareEvaluationUpdate } from "../src/evaluation-rebuild.js"
import { createDiskStore } from "../src/store.js"
import { ownershipInput } from "../src/ownership-input.js"
import { nativeCasDirectory } from "../src/genesis-native-io.js"
import { OWNERSHIP_ADMISSION_CRITERIA } from "@atlas/knowledge"

describe("isolated evaluation composed admission, synthetic CI only", () => {
  it("prepares, admits with exact new fixture decisions, reads with bounds, survives restart and refuses operational access and source drift", async () => {
    const original = fixture(), origin = original.prepare()
    const root = mkdtempSync(join(tmpdir(), "atlas-evaluation-positive-"))
    cleanups.push(() => rmSync(root, { recursive: true, force: true }))
    cpSync(join(original.repoPath, "src"), join(root, "src"), { recursive: true })
    cpSync(join(original.repoPath, "native"), join(root, "native"), { recursive: true })
    const write = (path: string, value: unknown) => writeFileSync(join(root, path), typeof value === "string" ? value : JSON.stringify(value))
    const ref = (path: string) => ({ payload_path: path, sha256: nativeSha256(readFileSync(join(root, path))) })
    write("native/original.json", origin)
    write("native/obligations.json", { schema: "genesis-obligation-set/v1", original_candidate: origin.candidate_id, original_contract: origin.candidate.contract,
      criteria: origin.candidate.criteria, normative_refs: [ref("native/protocol.md")], oracle_refs: [ref("native/oracle.md")], status: "PENDING_FINAL_EVIDENCE" })
    write("native/evaluation-plan.json", { schema: "genesis-evaluation-plan/v1", package_path: "native/native-package.json", original_prepared: ref("native/original.json"), obligations: ref("native/obligations.json"),
      entries: origin.candidate.entries.map((e) => ({ key: e.key, semantic_refs: [ref("native/semantic-a.md"), ref("native/semantic-b.md")], applicability: "synthetic semantic unit only", limits: "not campaign acceptance" })),
      consumer_ids: ["synthetic-case"], consumer_modes: { "synthetic-case": "routine" }, read_limits: { routine: { index_calls: 2, read_calls: 3, body_bytes_total: 4096 } },
      maintenance: { mode: "synthetic-not-run" }, implementation: { "native/recipe.md": ref("native/recipe.md").sha256 }, isolation: { root, original_root: original.repoPath } })
    const prepared = prepareEvaluation(root, "native/evaluation-plan.json"), generation = id({ generation: "synthetic-evaluation" })
    initializeEvaluationStore(root, prepared.candidate_id, generation)
    // Bootstrap must not repurpose prior state or overwrite an existing descriptor.
    expect(() => initializeEvaluationStore(root, prepared.candidate_id, generation)).toThrow("evaluation-bootstrap-nonempty-state")
    write(".atlas/policy.json", readFileSync(join(original.repoPath, ".atlas/policy.json"), "utf8"))
    const policy = { schema: "ownership-evaluation-policy/v1", root, ...prepared.candidate.evaluation, evaluationCandidate: prepared.candidate_id, generation, scope: "core", actor: "alice", operations: ["admit"], consumer: null }
    const { phase: _phase, ...operatorPolicy } = policy
    // The same ordinary advisory succeeds on an operational store, but not on initialized evaluation state.
    const { ownership: _unusedOwnership, ...ordinaryBase } = original.carrier(id({ synthetic: "unused" }))
    const ordinary = { ...ordinaryBase, claimNorm: "Synthetic ordinary operational control" }
    expect(createGovernedEmit({ store: original.store, policy: loadPolicy(original.repoPath), actor: "alice", gate: { gateHolds: () => "HOLDS" } })
      .emit(ordinary, id({ at: "ordinary-control" }))).toMatchObject({ emitted: true })
    const snapshot = (directory: string): string => JSON.stringify(readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
      .map((entry): unknown => entry.isSymbolicLink() ? [entry.name, readlinkSync(join(directory, entry.name))] : entry.isDirectory() ? [entry.name, snapshot(join(directory, entry.name))] : [entry.name, lstatSync(join(directory, entry.name)).ino, lstatSync(join(directory, entry.name)).mtimeMs, lstatSync(join(directory, entry.name)).ctimeMs, nativeSha256(readFileSync(join(directory, entry.name)))]))
    const beforeDirect = snapshot(join(root, ".atlas"))
    for (let restart = 0; restart < 2; restart++) {
      const freshStore = createDiskStore(nativeCasDirectory(root)), policy = loadPolicy(root)
      expect(freshStore.loadProjection()).toBeUndefined()
      expect(createGovernedEmit({ store: freshStore, policy, actor: "alice", gate: { gateHolds: () => "HOLDS" } })
        .emit(ordinary, id({ at: "must-refuse" }))).toEqual({ emitted: false, rejected: "evaluation-operation-denied" })
      expect(createGovernedEmit({ store: { ...freshStore }, policy, actor: "alice", gate: { gateHolds: () => "HOLDS" } })
        .emit(ordinary, id({ at: "spread-must-refuse" }))).toEqual({ emitted: false, rejected: "evaluation-operation-denied" })
      expect(createGovernedLink({ store: freshStore, policy, actor: "alice" }).link("a", "b"))
        .toEqual({ linked: false, rejected: "evaluation-operation-denied" })
      const emit = createGovernedEmit({ store: freshStore, policy, actor: "alice", gate: { gateHolds: () => "HOLDS" } })
      expect(() => createGovernedPromote({ store: freshStore, emit: emit.emit }).promote(id({ at: "promote-refuse" }))).toThrow("evaluation-operational-store-refused")
      expect(snapshot(join(root, ".atlas"))).toBe(beforeDirect)
    }
    write(".atlas/evaluation-policy.json", operatorPolicy)
    // A CAS-only alias must not combine E's CAS/capability with O's projection/staging.
    const aliasRoot = mkdtempSync(join(tmpdir(), "atlas-cas-only-alias-"))
    cleanups.push(() => rmSync(aliasRoot, { recursive: true, force: true }))
    mkdirSync(join(aliasRoot, ".atlas"))
    symlinkSync(join(root, ".atlas/cas"), join(aliasRoot, ".atlas/cas"), "dir")
    writeFileSync(join(aliasRoot, ".atlas/policy.json"), readFileSync(join(original.repoPath, ".atlas/policy.json")))
    const aliasBefore = snapshot(join(aliasRoot, ".atlas")), evaluationBefore = snapshot(join(root, ".atlas"))
    for (let restart = 0; restart < 2; restart++) {
      const aliasedStore = createDiskStore(nativeCasDirectory(aliasRoot))
      for (const evaluation of [undefined]) {
        const result = createGovernedEmit({ store: aliasedStore, policy: loadPolicy(aliasRoot), actor: "alice",
          gate: { gateHolds: () => "HOLDS" }, ...(evaluation === undefined ? {} : { evaluation }) })
          .emit(ordinary, id({ alias: restart }))
        expect(result).toEqual({ emitted: false, rejected: "evaluation-operation-denied" })
        expect(snapshot(join(aliasRoot, ".atlas"))).toBe(aliasBefore)
        expect(snapshot(join(root, ".atlas"))).toBe(evaluationBefore)
      }
    }
    const ordinaryRow = [...original.store.loadProjection()!.current.values()][0]!
    const ordinaryBlob = original.store.get(ordinaryRow.contentHash as import("@atlas/contracts").Hash) as Record<string, unknown>
    for (const proven of [true, false]) {
      const logRoot = mkdtempSync(join(tmpdir(), "atlas-ordinary-replay-control-"))
      cleanups.push(() => rmSync(logRoot, { recursive: true, force: true }))
      const logStore = createDiskStore(nativeCasDirectory(logRoot))
      const blob = { ...ordinaryBlob, ...(proven ? { seal: "proven" } : {}) }
      const contentHash = logStore.put(blob)
      const row = { ...ordinaryRow, nodeKey: asNodeKey(id({ replay: proven })), contentHash }
      appendKnowledge(logRoot, { seat: "alice", row, at: "2026-11-13T00:00:00.000Z", source: { migrated: true } }, blob)
      // Valid ordinary logs retain their legacy proven/staging behavior outside evaluation.
      expect(replayKnowledge(logRoot, logStore, loadPolicy(original.repoPath), () => true))
        .toMatchObject(proven ? { applied: 1, staged: 0 } : { applied: 0, staged: 1 })
      for (const dir of ["members", "blobs"]) cpSync(join(logRoot, ".atlas", dir), join(root, ".atlas", dir), { recursive: true })
      write(".atlas/evaluation-policy.json", { ...operatorPolicy, operations: ["read", "index"], consumer: { id: "synthetic-case", mode: "routine" } })
      const beforeReplay = snapshot(join(root, ".atlas"))
      for (let restart = 0; restart < 2; restart++) {
        const access = loadEvaluationAccess(root)
        expect(() => composeRuntime(root, access)).toThrow("evaluation-operational-replay-refused")
        expect(() => replayKnowledge(root, createDiskStore(nativeCasDirectory(root)), loadPolicy(root), () => true))
          .toThrow("evaluation-operational-store-refused")
        expect(snapshot(join(root, ".atlas"))).toBe(beforeReplay)
      }
      for (const dir of ["members", "blobs"]) rmSync(join(root, ".atlas", dir), { recursive: true, force: true })
    }
    write(".atlas/evaluation-policy.json", operatorPolicy)
    write("native/evaluation-request.json", prepared)
    const reviewers = ["synthetic-evaluation-a", "synthetic-evaluation-b"]
    write("native/evaluation-approval.json", { schema: "genesis-evaluation-binding/v1", purpose: "isolated-evaluation-admission", candidate_id: prepared.candidate_id, reviewers,
      decisions: reviewers.map((reviewer, index) => {
        write(`native/evaluation-response-${index}.txt`, `SYNTHETIC TEST ONLY: ${reviewer} ${prepared.candidate_id}`)
        const response = ref(`native/evaluation-response-${index}.txt`)
        return { reviewer, decision_id: `sha256:${response.sha256}`, purpose: "isolated-evaluation-admission", candidate_id: prepared.candidate_id, verdict: "PASS",
          entries: prepared.candidate.entries.map((entry) => ({ key: entry.key, contract: entry.contract, result: entry.artifact.result, inputs: entry.inputs_id, criteria: OWNERSHIP_ADMISSION_CRITERIA.map((id) => ({ id, verdict: "PASS" })) })),
          request_ref: ref("native/evaluation-request.json"), response_ref: response }
      }) })
    process.env.ATLAS_RATIFY_TOKEN = "explicit-synthetic-fixture-token"
    const admitted = await admitEvaluation(root, prepared, "native/evaluation-approval.json")
    expect(admitted).toMatchObject({ kind: "evaluation-admission-attempt", phase: "evaluation", emission: { ok: true, data: { emitted: true } } })
    if (admitted.kind === "hold") throw new Error("synthetic initial admission failed")
    // Reuse the exact carrier that just passed real synthetic evaluation admission as the second positive control.
    const admittedStore = createDiskStore(nativeCasDirectory(root))
    const admittedRow = [...admittedStore.loadProjection()!.current.values()][0]!
    const admittedPayload = admittedStore.get(admittedRow.contentHash as import("@atlas/contracts").Hash) as GroundedFact
    const admittedBefore = snapshot(join(root, ".atlas"))
    for (let reopen = 0; reopen < 2; reopen++) {
      const aliasedStore = createDiskStore(nativeCasDirectory(aliasRoot)), evaluation = loadEvaluationAccess(root)
      expect(createGovernedEmit({ store: aliasedStore, policy: loadPolicy(aliasRoot), actor: "alice", evaluation,
        gate: { gateHolds: () => "HOLDS" } }).emit(admittedPayload, id({ aliasEvaluation: reopen })))
        .toEqual({ emitted: false, rejected: "evaluation-operation-denied" })
      expect(snapshot(join(aliasRoot, ".atlas"))).toBe(aliasBefore)
      expect(snapshot(join(root, ".atlas"))).toBe(admittedBefore)
    }
    // Actual fresh processes reload persisted policy/store and exercise both writer modes.
    const moduleUrl = (name: string) => new URL(`../dist/src/${name}.js`, import.meta.url).href
    const childScript = `
      import assert from "node:assert/strict";
      import { createDiskStore } from ${JSON.stringify(moduleUrl("store"))};
      import { createGovernedEmit } from ${JSON.stringify(moduleUrl("governed-emit"))};
      import { loadPolicy } from ${JSON.stringify(moduleUrl("policy"))};
      import { loadEvaluationAccess } from ${JSON.stringify(moduleUrl("ownership-evaluation-policy"))};
      const [root, alias, ordinary, at] = process.argv.slice(1).map(JSON.parse);
      const real = createDiskStore(root + "/.atlas/cas");
      const row = [...real.loadProjection().current.values()][0];
      for (const evaluation of [undefined, loadEvaluationAccess(root)]) {
        const store = createDiskStore(alias + "/.atlas/cas");
        const emit = createGovernedEmit({ store, policy: loadPolicy(alias), actor: "alice",
          gate: { gateHolds: () => "HOLDS" }, ...(evaluation ? { evaluation } : {}) });
        assert.deepEqual(emit.emit(evaluation ? real.get(row.contentHash) : ordinary, at),
          { emitted: false, rejected: "evaluation-operation-denied" });
      }
      console.log(JSON.stringify({ pid: process.pid, refused: 2 }));
    `
    for (let restart = 0; restart < 2; restart++) {
      const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", childScript,
        ...[root, aliasRoot, ordinary, id({ processRestart: restart })].map((value) => JSON.stringify(value))],
        { encoding: "utf8", timeout: 30000 }))
      expect(result.refused).toBe(2)
      expect(result.pid).not.toBe(process.pid)
      expect(snapshot(join(aliasRoot, ".atlas"))).toBe(aliasBefore)
      expect(snapshot(join(root, ".atlas"))).toBe(admittedBefore)
    }
    const copiedRoot = mkdtempSync(join(tmpdir(), "atlas-evaluation-copied-"))
    cleanups.push(() => rmSync(copiedRoot, { recursive: true, force: true }))
    for (const dir of ["src", ".atlas"]) cpSync(join(root, dir), join(copiedRoot, dir), { recursive: true })
    rmSync(join(copiedRoot, ".atlas/evaluation-store.json"))
    rmSync(join(copiedRoot, ".atlas/evaluation-policy.json"))
    const direct = assembleHandler({ repoPath: copiedRoot, casPath: nativeCasDirectory(copiedRoot), scipPath: join(copiedRoot, ".atlas/index.scip"),
      seams: { heuristic: { isCandidate: () => false }, gate: { gateHolds: () => "HOLDS" },
        classifier: { reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }) }, driftFacts: [], resolveAnchorAt: () => undefined } })
    const copiedStore = createDiskStore(nativeCasDirectory(copiedRoot)), copiedPolicy = loadPolicy(copiedRoot)
    expect(createGovernedLink({ store: copiedStore, policy: copiedPolicy, actor: "alice" }).link("a", "b"))
      .toEqual({ linked: false, rejected: "evaluation-operation-denied" })
    expect(createGovernedEmit({ store: copiedStore, policy: copiedPolicy, actor: "alice", gate: { gateHolds: () => "HOLDS" } })
      .emit({ kind: "negation" } as GroundedFact, id({ at: "copied-negative" })))
      .toEqual({ emitted: false, rejected: "evaluation-operation-denied" })
    for (const handler of [direct, composeRuntime(copiedRoot).handler]) {
      const query = JSON.stringify(handler.handle("atlas-query", { scope: "core" }))
      expect(query).not.toContain("Evaluation-only ownership manifest")
      expect(query).not.toContain(prepared.candidate_id)
    }
    // Exercise the distinct fresh-target host route with a complete unchanged graph.
    const targetRoot = mkdtempSync(join(tmpdir(), "atlas-evaluation-target-"))
    cleanups.push(() => rmSync(targetRoot, { recursive: true, force: true }))
    for (const dir of ["src", "native"]) cpSync(join(root, dir), join(targetRoot, dir), { recursive: true })
    const store = createDiskStore(nativeCasDirectory(root))
    const targetGeneration = id({ generation: "synthetic-target" })
    const target = prepareEvaluationUpdate({ store, baseline: prepared, manifest: admitted.ownership,
      context: loadEvaluationAccess(root).context, targetGeneration, targetRepoRoot: targetRoot,
      recipes: new Map(prepared.candidate.entries.map((entry) => [entry.key, { key: entry.key, recipeInputKey: "file:native/recipe.md",
        recipeVersion: ownershipInput(root, "file:native/recipe.md")!, declaredInputs: entry.inputs.map((x) => x.key), required: entry.dependencies.map((x) => x.key),
        run: () => { throw new Error("unchanged target must not run producer") } }])),
      observe: (key) => { const version = ownershipInput(targetRoot, key); return version === undefined ? { kind: "absent", key } : { kind: "present", key, version } },
      readCapturedBytes: (key) => key.startsWith("file:") ? new Uint8Array(readFileSync(join(targetRoot, key.slice(5)))) : undefined,
      listMembers: () => [], semanticEvidence: () => undefined })
    expect(target.kind).toBe("prepared-evaluation-update")
    if (target.kind !== "prepared-evaluation-update") throw new Error("synthetic target preparation failed")
    expect(target.calls).toEqual([])
    cpSync(nativeCasDirectory(root), nativeCasDirectory(targetRoot), { recursive: true })
    initializeEvaluationStore(targetRoot, target.prepared.candidate_id, targetGeneration)
    const twrite = (path: string, value: unknown) => writeFileSync(join(targetRoot, path), typeof value === "string" ? value : JSON.stringify(value))
    const tref = (path: string) => ({ payload_path: path, sha256: nativeSha256(readFileSync(join(targetRoot, path))) })
    twrite(".atlas/policy.json", readFileSync(join(root, ".atlas/policy.json"), "utf8"))
    twrite(".atlas/evaluation-policy.json", { ...operatorPolicy, root: targetRoot, evaluationPlan: target.prepared.candidate.evaluation.evaluationPlan,
      evaluationCandidate: target.prepared.candidate_id, generation: targetGeneration })
    twrite("native/target-request.json", target.prepared)
    twrite("native/target-approval.json", { schema: "genesis-evaluation-binding/v1", purpose: "isolated-evaluation-admission", candidate_id: target.prepared.candidate_id, reviewers,
      decisions: reviewers.map((reviewer, index) => {
        twrite(`native/target-response-${index}.txt`, `SYNTHETIC TARGET ONLY ${reviewer} ${target.prepared.candidate_id}`)
        const response = tref(`native/target-response-${index}.txt`)
        return { reviewer, decision_id: `sha256:${response.sha256}`, purpose: "isolated-evaluation-admission", candidate_id: target.prepared.candidate_id, verdict: "PASS",
          entries: target.prepared.candidate.entries.map((entry) => ({ key: entry.key, contract: entry.contract, result: entry.artifact.result, inputs: entry.inputs_id, criteria: OWNERSHIP_ADMISSION_CRITERIA.map((id) => ({ id, verdict: "PASS" })) })),
          request_ref: tref("native/target-request.json"), response_ref: response }
      }) })
    expect(await admitEvaluationRebuildTarget(targetRoot, target.prepared, "native/target-approval.json")).toMatchObject({ kind: "evaluation-admission-attempt", emission: { ok: true, data: { emitted: true } } })
    expect(() => composeRuntime(targetRoot)).toThrow("evaluation-operational-composition-refused")
    expect(() => composeRuntime(root)).toThrow("evaluation-operational-composition-refused")
    write(".atlas/evaluation-policy.json", { ...operatorPolicy, operations: ["read", "index"], consumer: { id: "synthetic-case", mode: "routine" } })
    const runtime = () => composeRuntime(root, loadEvaluationAccess(root))
    expect(runtime().ownership.index("core", "entry")).toMatchObject({ kind: "index", evaluation: { phase: "evaluation", evaluationCandidate: prepared.candidate_id } })
    expect(runtime().ownership.read({ scope: "core", key: "does-not-exist", maxBytes: 4096 })).toMatchObject({ kind: "hold", reason: "ownership-selection", evaluation: { evaluationCandidate: prepared.candidate_id } })
    expect(runtime().ownership.read({ scope: "core", need: "entry", maxBytes: 4096 })).toMatchObject({ kind: "ready", evaluation: { phase: "evaluation" }, body: readFileSync(join(root, "native/bodies/entry.md"), "utf8") })
    expect(runtime().ownership.index("core", "entry").kind).toBe("index")
    expect(runtime().ownership.index("core", "entry").kind).toBe("hold")
    write("src/util.ts", "export const changed = true\n")
    expect(runtime().ownership.read({ scope: "core", need: "entry", maxBytes: 4096 }).kind).toBe("hold")
  })
})
