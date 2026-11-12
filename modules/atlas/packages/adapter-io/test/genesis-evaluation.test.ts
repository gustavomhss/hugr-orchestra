import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { asHash, id } from "@atlas/kernel"
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
      consumer_ids: ["synthetic-case"], consumer_modes: { "synthetic-case": "routine" }, read_limits: { routine: { index_calls: 2, read_calls: 2, body_bytes_total: 4096 } },
      maintenance: { mode: "synthetic-not-run" }, implementation: { "native/recipe.md": ref("native/recipe.md").sha256 }, isolation: { root, original_root: original.repoPath } })
    const prepared = prepareEvaluation(root, "native/evaluation-plan.json"), generation = id({ generation: "synthetic-evaluation" })
    initializeEvaluationStore(root, prepared.candidate_id, generation)
    // Bootstrap must not repurpose prior state or overwrite an existing descriptor.
    expect(() => initializeEvaluationStore(root, prepared.candidate_id, generation)).toThrow("evaluation-bootstrap-nonempty-state")
    write(".atlas/policy.json", readFileSync(join(original.repoPath, ".atlas/policy.json"), "utf8"))
    const policy = { schema: "ownership-evaluation-policy/v1", root, ...prepared.candidate.evaluation, evaluationCandidate: prepared.candidate_id, generation, scope: "core", actor: "alice", operations: ["admit"], consumer: null }
    const { phase: _phase, ...operatorPolicy } = policy
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
    expect(runtime().ownership.read({ scope: "core", need: "entry", maxBytes: 4096 })).toMatchObject({ kind: "ready", evaluation: { phase: "evaluation" }, body: readFileSync(join(root, "native/bodies/entry.md"), "utf8") })
    expect(runtime().ownership.index("core", "entry").kind).toBe("index")
    expect(runtime().ownership.index("core", "entry").kind).toBe("hold")
    write("src/util.ts", "export const changed = true\n")
    expect(runtime().ownership.read({ scope: "core", need: "entry", maxBytes: 4096 }).kind).toBe("hold")
  })
})
