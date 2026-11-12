import { afterEach, describe, expect, it } from "vitest"
import { linkSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { asNodeKey, createStore, id } from "@atlas/kernel"
import type { GroundedFact } from "@atlas/knowledge"
import { OWNERSHIP_ADMISSION_CRITERIA } from "@atlas/knowledge"
import { composeRuntime } from "../src/compose.js"
import { createDiskStore } from "../src/store.js"
import { loadEvaluationAccess, assertEvaluationComposition, genericOwnershipVisible, phaseFilteredStore } from "../src/ownership-evaluation-policy.js"
import { ownershipAttachmentRefusal } from "../src/ownership-attachment.js"
import { rebuildOwnershipUpdate } from "../src/ownership-rebuild.js"
import { chargeEvaluationRead } from "../src/evaluation-read-budget.js"
import { validateEvaluationBinding } from "../src/genesis-evaluation-binding.js"
import type { EvaluationBinding } from "../src/genesis-evaluation-binding.js"
import type { PreparedEvaluation } from "../src/genesis-evaluation.js"

// Synthetic CI fixtures only. No real candidate, reviewer decision, campaign admission or publication.
const roots: string[] = []
const originalActor = process.env.ATLAS_ACTOR
function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "atlas-evaluation-boundary-"))
  roots.push(root)
  mkdirSync(join(root, ".atlas", "cas"), { recursive: true })
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  if (originalActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = originalActor
})

function policyFixture() {
  const root = temporaryRoot()
  const stat = lstatSync(root)
  const store = createDiskStore(join(root, ".atlas/cas"))
  const evaluationPlan = store.put({ schema: "genesis-evaluation-plan/v1", consumer_ids: ["case"], consumer_modes: { case: "routine" }, read_limits: { routine: { index_calls: 2, read_calls: 2, body_bytes_total: 16 } } })
  const obligationSet = store.put({ obligations: "synthetic" })
  const evaluationCandidate = store.put({ kind: "genesis-evaluation-candidate", version: 2, phase: "evaluation", repo_root: root, scope: "test.scope", evaluation: { phase: "evaluation", evaluationPlan, obligationSet } })
  const shared = { root, evaluationPlan, obligationSet, evaluationCandidate, generation: id({ generation: "synthetic" }), scope: "test.scope" }
  const marker = { schema: "ownership-evaluation-store/v1", ...shared, device: stat.dev, inode: stat.ino, original_root: `${root}-original`, initialized_cas_only: true }
  const policy = { schema: "ownership-evaluation-policy/v1", ...shared, actor: "fixture-operator", operations: ["read", "index", "admit"], consumer: { id: "case", mode: "routine" } }
  process.env.ATLAS_ACTOR = policy.actor
  const save = () => {
    writeFileSync(join(root, ".atlas/evaluation-store.json"), JSON.stringify(marker))
    writeFileSync(join(root, ".atlas/evaluation-policy.json"), JSON.stringify(policy))
  }
  save()
  return { root, marker, policy, save }
}

function bindingFixture(): { prepared: PreparedEvaluation; binding: EvaluationBinding } {
  const contract = id({ contract: "synthetic admission" }), result = id({ result: "synthetic" })
  const inputs = [{ key: "file:input", version: "v1" }], dependencies: [] = []
  const inputsId = id({ inputs, dependencies })
  const candidate: PreparedEvaluation["candidate"] = {
    kind: "genesis-evaluation-candidate", version: 2, phase: "evaluation", plan_path: "plan.json", runtime_identity: { runtime: "synthetic" },
    evaluation: { phase: "evaluation", evaluationPlan: id({ plan: "synthetic" }), obligationSet: id({ obligations: "synthetic" }) },
    original_candidate: id({ original: "synthetic" }), original_contract: id({ original: "contract" }),
    repo_root: "/synthetic/not-used", observed_head: null, source_revision: "synthetic-not-git", scope: "test.scope", session: "TEST",
    reference_commit_verification: "external-capture-evidence-required", transport: { path: "package.json", sha256: "a".repeat(64), body: id({ package: "synthetic" }) },
    implementation: {}, references: [], observations: [], roots: { entry: "entry" }, required_artifact_keys: ["entry"],
    entries: [{ key: "entry", artifact: { kind: "ownership-artifact", version: 1, key: "entry", scope: "test.scope", title: "Synthetic", layer: 1, need: "entry", result, navigation: [] },
      inputs, dependencies, inputs_id: inputsId, contract, semanticEvidence: [id({ semantic: "fixture-a" }), id({ semantic: "fixture-b" })] }],
  }
  const prepared: PreparedEvaluation = { schema: "genesis-native-prepared/v2", candidate_id: id(candidate), candidate }
  const binding: EvaluationBinding = { schema: "genesis-evaluation-binding/v1", purpose: "isolated-evaluation-admission", candidate_id: prepared.candidate_id,
    reviewers: ["synthetic-reviewer-a", "synthetic-reviewer-b"], decisions: ["a", "b"].map((suffix, index) => ({
      reviewer: `synthetic-reviewer-${suffix}`, decision_id: `sha256:${suffix.repeat(64)}`, purpose: "isolated-evaluation-admission", candidate_id: prepared.candidate_id, verdict: "PASS",
      entries: [{ key: "entry", contract, result, inputs: inputsId, criteria: OWNERSHIP_ADMISSION_CRITERIA.map((criterion) => ({ id: criterion, verdict: "PASS" })) }],
      request_ref: { payload_path: `requests/${index}.txt`, sha256: "c".repeat(64) }, response_ref: { payload_path: `responses/${index}.txt`, sha256: suffix.repeat(64) },
    })) }
  return { prepared, binding }
}

describe("evaluation boundaries, synthetic CI only", () => {
  it("rejects unknown policy keys and unknown versions", () => {
    const f = policyFixture()
    writeFileSync(join(f.root, ".atlas/evaluation-policy.json"), JSON.stringify({ ...f.policy, allowProduction: true }))
    expect(() => loadEvaluationAccess(f.root)).toThrow("native-fields")
    writeFileSync(join(f.root, ".atlas/evaluation-policy.json"), JSON.stringify({ ...f.policy, schema: "ownership-evaluation-policy/v999" }))
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-policy-version")
  })

  it("rejects incorrect root identity even when policy repeats it", () => {
    const f = policyFixture()
    f.marker.inode += 1
    f.save()
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-root-identity")
  })

  it("rejects mutable state hardlinks", () => {
    const f = policyFixture()
    linkSync(join(f.root, ".atlas/evaluation-policy.json"), join(f.root, ".atlas/policy-alias.json"))
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-state-alias")
  })

  it("rejects a scope wildcard, wrong actor and operational permission", () => {
    const f = policyFixture()
    f.marker.scope = "*"; f.policy.scope = "*"; f.save()
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-policy-actor-scope")
    f.marker.scope = "test.scope"; f.policy.scope = "test.scope"; f.save()
    process.env.ATLAS_ACTOR = "not-the-fixture-operator"
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-policy-actor-scope")
    process.env.ATLAS_ACTOR = f.policy.actor
    f.policy.operations.push("production-activate"); f.save()
    expect(() => loadEvaluationAccess(f.root)).toThrow("evaluation-policy-operations")
  })

  it("refuses default composition with an evaluation marker before any operational read", () => {
    const f = policyFixture()
    expect(() => assertEvaluationComposition(f.root)).toThrow("evaluation-operational-composition-refused")
    expect(() => composeRuntime(f.root)).toThrow("evaluation-operational-composition-refused")
  })

  it("cannot manufacture an issued composition context by matching fields", () => {
    const f = policyFixture()
    const issued = loadEvaluationAccess(f.root)
    expect(() => assertEvaluationComposition(f.root, { ...issued })).toThrow("evaluation-unverified-context")
  })

  it("rechecks policy content and operation permission on each capability use", () => {
    const f = policyFixture()
    const access = loadEvaluationAccess(f.root)
    expect(() => access.assert("read")).not.toThrow()
    expect(() => access.assert("evaluation-maintenance")).toThrow("evaluation-policy-drift-or-denied")
    f.policy.operations = ["read"]; f.save()
    expect(() => access.assert("read")).toThrow("evaluation-policy-drift-or-denied")
  })

  it("filters raw ownership CAS and evaluation carrier claims from generic reads", () => {
    const root = temporaryRoot(), store = createDiskStore(join(root, ".atlas/cas"))
    const body = store.put({ kind: "ownership-body", version: 1, bytes: [115, 101, 99, 114, 101, 116] })
    const carrier = store.put({ kind: "advisory", claimNorm: "Evaluation-only ownership manifest for test.scope: synthetic", grounding: { entries: [] } })
    expect(genericOwnershipVisible(store.get(body))).toBe(false)
    expect(genericOwnershipVisible(store.get(carrier))).toBe(false)
    const filtered = phaseFilteredStore(store)
    expect(filtered.get(body)).toBeUndefined()
    expect(filtered.get(carrier)).toBeUndefined()
    expect(store.get(body)).toBeDefined() // bytes retained, not deleted as a substitute for authority checks
  })

  it("direct composed node lookup does not leak raw ownership CAS by content address", () => {
    const root = temporaryRoot(), store = createDiskStore(join(root, ".atlas/cas"))
    const body = store.put({ kind: "ownership-body", version: 1, bytes: [...new TextEncoder().encode("PRIVATE-EVALUATION-CANARY")] })
    const runtime = composeRuntime(root)
    const result = runtime.handler.resolveNode(asNodeKey(body), "cli")
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain("PRIVATE-EVALUATION-CANARY")
    expect(JSON.stringify(result)).not.toContain('"bytes"')
  })

  it("operational attachment refuses evaluation claims even without an ownership field", () => {
    const root = temporaryRoot(), store = createDiskStore(join(root, ".atlas/cas"))
    const node: GroundedFact = { kind: "advisory", id: asNodeKey("synthetic"), tier: "T2", scope: "test.scope", predicateSlot: "ownership",
      claimNorm: "Evaluation-only ownership manifest for test.scope: synthetic", grounding: { entries: [] }, freshness: "FRESH", claims: [], authoring: "ADVISORY" }
    expect(ownershipAttachmentRefusal(node, store, () => "v1")).toBe("evaluation-operational-attachment-refused")
  })

  it("legacy rebuild explicitly refuses v2 instead of downgrading receipts", () => {
    const store = createStore(), manifest = store.put({ kind: "ownership-manifest", version: 2 })
    const result = rebuildOwnershipUpdate({ store, manifest, scope: "test.scope", observe: () => ({ kind: "unavailable" }),
      readCapturedBytes: () => undefined, listMembers: () => [], recipes: new Map(), contract: id({ contract: "synthetic" }),
      evaluate: () => { throw new Error("must not evaluate legacy path") } })
    expect(result).toMatchObject({ kind: "hold", reason: "ownership-phase" })
  })

  it("checks a synthetic exact two-decision binding without granting runtime authority", () => {
    const f = bindingFixture()
    expect(validateEvaluationBinding(f.binding, f.prepared)).toBe(f.binding)
  })

  it("rejects zero, one and duplicate decision/reviewer sets", () => {
    const f = bindingFixture()
    for (const binding of [{ ...f.binding, decisions: [] }, { ...f.binding, decisions: f.binding.decisions.slice(0, 1) },
      { ...f.binding, reviewers: [f.binding.reviewers[0]!, f.binding.reviewers[0]!] },
      { ...f.binding, decisions: [f.binding.decisions[0]!, f.binding.decisions[0]!] }]) {
      expect(() => validateEvaluationBinding(binding, f.prepared)).toThrow()
    }
  })

  it("rejects stale candidate, omitted entries, altered contract/input/result and operational criterion PASS", () => {
    const f = bindingFixture(), first = f.binding.decisions[0]!, entry = first.entries[0]!
    const entries = [[], [{ ...entry, contract: "d".repeat(64) }], [{ ...entry, inputs: "d".repeat(64) }],
      [{ ...entry, result: "d".repeat(64) }], [{ ...entry, criteria: [{ id: "AC-02", verdict: "PASS" }] }]]
    expect(() => validateEvaluationBinding({ ...f.binding, candidate_id: "e".repeat(64) }, f.prepared)).toThrow("evaluation-binding-identity")
    for (const changed of entries) expect(() => validateEvaluationBinding({ ...f.binding, decisions: [{ ...first, entries: changed }, f.binding.decisions[1]!] }, f.prepared)).toThrow()
  })

  it("rejects HOLD or copied provenance as new binding decisions", () => {
    const f = bindingFixture(), first = f.binding.decisions[0]!, second = f.binding.decisions[1]!
    expect(() => validateEvaluationBinding({ ...f.binding, decisions: [{ ...first, verdict: "HOLD" }, second] }, f.prepared)).toThrow("evaluation-binding-decision")
    expect(() => validateEvaluationBinding({ ...f.binding, decisions: [first, { ...second, decision_id: first.decision_id, response_ref: first.response_ref }] }, f.prepared)).toThrow("evaluation-binding-provenance")
  })

  it("enforces a durable finite budget across new capability instances", () => {
    const f = policyFixture()
    loadEvaluationAccess(f.root).charge("read")
    loadEvaluationAccess(f.root).charge("read")
    expect(() => loadEvaluationAccess(f.root).charge("read")).toThrow("evaluation-budget-exhausted")
    loadEvaluationAccess(f.root).charge("body", 16)
    expect(() => loadEvaluationAccess(f.root).charge("body", 1)).toThrow("evaluation-budget-exhausted")
  })

  it("budget lock contention refuses without retry and invalid byte counts refuse", () => {
    const root = temporaryRoot(), candidate = "a".repeat(64), generation = "b".repeat(64)
    const consumer = { id: "case", mode: "routine", limits: { read_calls: 1, index_calls: 1, body_bytes_total: 8 } }
    const key = id({ candidate, generation, consumer: consumer.id, mode: consumer.mode })
    mkdirSync(join(root, ".atlas", `evaluation-budget-${key}.json.lock`))
    expect(() => chargeEvaluationRead(root, candidate, generation, consumer, "read")).toThrow()
    rmSync(join(root, ".atlas", `evaluation-budget-${key}.json.lock`), { recursive: true })
    expect(() => chargeEvaluationRead(root, candidate, generation, consumer, "body", -1)).toThrow("evaluation-budget-bytes")
  })

})
