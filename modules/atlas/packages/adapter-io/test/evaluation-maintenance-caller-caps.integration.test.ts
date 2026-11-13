import { describe, expect, it } from "vitest"
import { createStore, id } from "@atlas/kernel"
import { OWNERSHIP_ADMISSION_CRITERIA } from "@atlas/knowledge"
import type { EvaluationOwnershipArtifact, EvaluationOwnershipContract, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, EvaluationOwnershipReview, OwnershipEvaluationContext } from "@atlas/knowledge"
import type { EvaluationCandidate, PreparedEvaluation } from "../src/genesis-evaluation.js"
import { evaluationRuntimeIdentity } from "../src/evaluation-runtime-identity.js"
import { prepareMaintenanceCaller } from "../src/evaluation-maintenance-caller.js"
import type { MaintenanceCallerDescriptor, MaintenanceCallerPorts } from "../src/evaluation-maintenance-caller.js"
import type { MaintenanceHostEnvelope } from "../src/evaluation-maintenance-host.js"

// New synthetic fixture derived from the public evaluation-rebuild/host fixture pattern.
// No mocks of caller, host or core; no campaign content, operational admission or publication.
function fixture() {
  const store = createStore(), current = new Map([["file:source", "s1"], ["file:recipe", "r1"]])
  const source = { body: "old synthetic body" }
  const keys = Array.from({ length: 15 }, (_, index) => `synthetic-entry-${index}`)
  const plan = store.put({ schema: "genesis-evaluation-plan/v1", consumer_ids: ["test"], consumer_modes: { test: "routine" },
    read_limits: { routine: { index_calls: 2, read_calls: 2, body_bytes_total: 1024 } }, maintenance: { synthetic: true },
    isolation: { root: "/synthetic", original_root: "/original" } })
  const evaluation = { phase: "evaluation" as const, evaluationPlan: plan, obligationSet: store.put({ syntheticObligations: "unchanged" }) }
  const contract: EvaluationOwnershipContract = { kind: "ownership-contract", version: 2, evaluation, criteria: [...OWNERSHIP_ADMISSION_CRITERIA] }
  const contractHash = store.put(contract), inputs = [...current].map(([key, version]) => ({ key, version })), dependencies: [] = []
  const inputsId = id({ inputs, dependencies })
  const body = store.put({ kind: "ownership-body", version: 1, bytes: [...new TextEncoder().encode(source.body)] })
  const result = store.put({ kind: "ownership-result", version: 1, body, authority: { scope: "test.scope", basis: "synthetic" }, validity: "supported", gaps: [], evidence: ["synthetic-only"] })
  const candidate: EvaluationCandidate = {
    kind: "genesis-evaluation-candidate", version: 2, phase: "evaluation", plan_path: "plan.json", runtime_identity: evaluationRuntimeIdentity(), evaluation,
    original_candidate: id({ origin: "candidate" }), original_contract: id({ origin: "contract" }), repo_root: "/synthetic", observed_head: null,
    source_revision: "synthetic", scope: "test.scope", session: "TEST", reference_commit_verification: "external-capture-evidence-required",
    transport: { path: "package.json", sha256: "a".repeat(64), body: id({ package: "synthetic" }) }, implementation: {}, references: [], observations: inputs,
    entries: keys.map(key => ({ key, artifact: { kind: "ownership-artifact", version: 1, key, scope: "test.scope", title: key, layer: 1, need: "entry", result, navigation: [] },
      inputs, dependencies, inputs_id: inputsId, contract: contractHash,
      semanticEvidence: [store.put({ oldSemantic: "a", key }), store.put({ oldSemantic: "b", key })] })),
    roots: { entry: keys[0]! }, required_artifact_keys: keys,
  }
  const candidateId = store.put(candidate)
  const context: OwnershipEvaluationContext = { evaluation, evaluationCandidate: candidateId, generation: id({ generation: "baseline" }) }
  const entries = candidate.entries.map(entry => {
    const reviews = ["synthetic-reviewer-a", "synthetic-reviewer-b"].map(reviewer => {
      const review: EvaluationOwnershipReview = { kind: "ownership-review", version: 2, evaluation, evaluationCandidate: candidateId, reviewer,
        contract: contractHash, inputs: inputsId, result, criteria: [...OWNERSHIP_ADMISSION_CRITERIA], verdict: "pass", provenance: "synthetic baseline fixture only" }
      return store.put(review)
    })
    const receipt: EvaluationOwnershipReceipt = { kind: "ownership-receipt", version: 2, evaluation, evaluationCandidate: candidateId, contract: contractHash, inputs, dependencies, reviews }
    const artifact: EvaluationOwnershipArtifact = { ...entry.artifact, version: 2, evaluation, evaluationCandidate: candidateId, receipt: store.put(receipt) }
    return { key: entry.key, artifact: store.put(artifact) }
  })
  const manifest: EvaluationOwnershipManifest = { kind: "ownership-manifest", version: 2, evaluation, evaluationCandidate: candidateId, generation: context.generation,
    scope: "test.scope", roots: candidate.roots, entries }
  const baseline: PreparedEvaluation = { schema: "genesis-native-prepared/v2", candidate_id: candidateId, candidate }
  const ports: MaintenanceCallerPorts = { store, baseline, manifest: store.put(manifest), context,
    observe: key => current.has(key) ? { kind: "present", version: current.get(key)! } : { kind: "absent" },
    readCapturedBytes: key => new TextEncoder().encode(key === "file:source" ? source.body : "recipe bytes"), listMembers: () => [],
    semanticEvidence: (key, target) => [store.put({ newSemantic: "a", key, target }), store.put({ newSemantic: "b", key, target })] }
  const envelope: MaintenanceHostEnvelope = { stage: "prepare", candidate: candidateId, targetRoot: "/synthetic-target", targetGeneration: id({ generation: "target" }),
    maxEntries: 15, maxRecipeCalls: 15, maxCapturedBytes: 1048576, maxOutputBytes: 1048576, releaseReference: "synthetic-only-no-authority" }
  const descriptor: MaintenanceCallerDescriptor = { schema: "evaluation-maintenance-caller/v1", baselineCandidate: candidateId, baselineManifest: ports.manifest,
    baselineGeneration: context.generation, targetRoot: envelope.targetRoot, targetGeneration: id({ generation: "target" }),
    recipes: keys.map(key => ({ key, recipeInputKey: "file:recipe", recipeVersion: "r1", declaredInputs: ["file:source", "file:recipe"], required: [] })), produced: [] }
  const change = (): MaintenanceCallerDescriptor => {
    source.body = "new synthetic body"; current.set("file:source", "s2")
    return { ...descriptor, produced: keys.map(key => ({ key, capturedVersions: [...current].map(([key, version]) => ({ key, version })), dependencies: [], output: { body: source.body } })) }
  }
  return { keys, ports, envelope, descriptor, change }
}

describe("caller to real host and core, synthetic fifteen-entry fixture", () => {
  it("preserves all fifteen entries with zero productions at an isolated new root", () => {
    const f = fixture(), out = prepareMaintenanceCaller(f.envelope, f.descriptor, f.ports)
    expect(out.releaseReference).toBe(f.envelope.releaseReference)
    expect(out.accounting.recipeCalls).toEqual([])
    expect(out.accounting.outputBytes).toBe(0)
    expect(out.accounting.capturedBytes).toBeGreaterThan(0)
    expect(out.accounting.externalProductionUsage).toBe("UNKNOWN")
    expect(out.result.kind).toBe("prepared-evaluation-update")
    if (out.result.kind !== "prepared-evaluation-update") throw Error(JSON.stringify(out.result))
    expect(out.result.prepared.candidate.entries.map(entry => entry.key)).toEqual(f.keys)
    expect(out.result.prepared.candidate.entries.map(entry => entry.artifact.result)).toEqual(f.ports.baseline.candidate.entries.map(entry => entry.artifact.result))
    expect(out.result.prepared.candidate.repo_root).toBe(f.envelope.targetRoot)
  })
  it("produces all fifteen with actual accounting and a newly hashed candidate", () => {
    const f = fixture(), descriptor = f.change(), out = prepareMaintenanceCaller(f.envelope, descriptor, f.ports)
    expect(out.result.kind).toBe("prepared-evaluation-update")
    expect([...out.accounting.recipeCalls].sort()).toEqual([...f.keys].sort())
    expect(out.accounting.outputBytes).toBe(15 * new TextEncoder().encode("new synthetic body").byteLength)
    if (out.result.kind !== "prepared-evaluation-update") throw Error(JSON.stringify(out.result))
    expect(out.result.prepared.candidate.entries).toHaveLength(15)
    expect(out.result.prepared.candidate_id).toBe(id(out.result.prepared.candidate))
    expect(out.result.prepared.candidate_id).not.toBe(f.ports.baseline.candidate_id)
  })
  it("returns nested HOLD and accounting when requested production is missing", () => {
    const f = fixture(); f.change()
    const out = prepareMaintenanceCaller(f.envelope, f.descriptor, f.ports)
    expect(out.result.kind).toBe("hold")
    if (out.result.kind !== "hold") throw Error("expected HOLD")
    expect(out.result.evidence).toContain("maintenance-caller-missing-production")
    expect(out.accounting.recipeCalls).toHaveLength(1)
    expect(out.accounting.outputBytes).toBe(0)
    expect(out.releaseReference).toBe(f.envelope.releaseReference)
  })
  it("enforces real host output cap and reports the attempted callback in HOLD", () => {
    const f = fixture(), descriptor = f.change()
    const out = prepareMaintenanceCaller({ ...f.envelope, maxOutputBytes: 1 }, descriptor, f.ports)
    expect(out.result.kind).toBe("hold")
    if (out.result.kind !== "hold") throw Error("expected HOLD")
    expect(out.result.evidence).toContain("maintenance-host-output-cap")
    expect(out.accounting.recipeCalls).toHaveLength(1)
    expect(out.accounting.outputBytes).toBeGreaterThan(1)
  })
  it("rejects wrong envelope stage through the real host", () => {
    const f = fixture()
    expect(() => prepareMaintenanceCaller({ ...f.envelope, stage: "finalize" }, f.descriptor, f.ports)).toThrow("maintenance-host-envelope")
  })
})


describe("maintenance caller cumulative host caps, synthetic public fifteen-entry fixture", () => {
  it("holds at maxRecipeCalls below the fifteen changed-entry demand with exact attempted-call accounting", () => {
    const f = fixture(), descriptor = f.change()
    const bodyBytes = new TextEncoder().encode("new synthetic body").byteLength
    const out = prepareMaintenanceCaller({ ...f.envelope, maxRecipeCalls: 14 }, descriptor, f.ports)
    expect(out.result.kind).toBe("hold")
    if (out.result.kind !== "hold") throw Error("expected HOLD")
    expect(out.result.evidence).toContain("maintenance-host-call-cap")
    expect(out.accounting.recipeCalls).toEqual(f.keys.slice(0, 14))
    expect(out.accounting.outputBytes).toBe(14 * bodyBytes)
    expect(out.accounting.capturedBytes).toBe(bodyBytes + new TextEncoder().encode("recipe bytes").byteLength)
    expect(out.releaseReference).toBe(f.envelope.releaseReference)
  })

  it("distinguishes maxEntries 14 rejection from maxEntries 15 acceptance", () => {
    const blocked = fixture(), descriptor = blocked.change()
    expect(() => prepareMaintenanceCaller({ ...blocked.envelope, maxEntries: 14 }, descriptor, blocked.ports))
      .toThrow("maintenance-host-isolation")
    const allowed = fixture(), allowedDescriptor = allowed.change()
    const out = prepareMaintenanceCaller({ ...allowed.envelope, maxEntries: 15 }, allowedDescriptor, allowed.ports)
    expect(out.result.kind).toBe("prepared-evaluation-update")
    expect(out.accounting.recipeCalls).toEqual(allowed.keys)
    expect(out.accounting.outputBytes).toBe(15 * new TextEncoder().encode("new synthetic body").byteLength)
  })

  it("accepts aggregate captured bytes exactly at the boundary and HOLDs one byte below it", () => {
    const total = new TextEncoder().encode("new synthetic body").byteLength +
      new TextEncoder().encode("recipe bytes").byteLength
    const exact = fixture(), exactDescriptor = exact.change()
    const accepted = prepareMaintenanceCaller({ ...exact.envelope, maxCapturedBytes: total }, exactDescriptor, exact.ports)
    expect(accepted.result.kind).toBe("prepared-evaluation-update")
    expect(accepted.accounting.capturedBytes).toBe(total)
    expect(accepted.accounting.recipeCalls).toEqual(exact.keys)
    const short = fixture(), shortDescriptor = short.change()
    const held = prepareMaintenanceCaller({ ...short.envelope, maxCapturedBytes: total - 1 }, shortDescriptor, short.ports)
    expect(held.result.kind).toBe("hold")
    if (held.result.kind !== "hold") throw Error("expected HOLD")
    expect(held.result.evidence).toContain("maintenance-host-capture-cap")
    expect(held.accounting.capturedBytes).toBe(total)
    expect(held.accounting.recipeCalls).toEqual([])
    expect(held.accounting.outputBytes).toBe(0)
    expect(held.releaseReference).toBe(short.envelope.releaseReference)
  })

  it("HOLDs when each body is below the cap but cumulative output exceeds it", () => {
    const f = fixture(), descriptor = f.change()
    const bodyBytes = new TextEncoder().encode("new synthetic body").byteLength
    const aggregateCap = bodyBytes * 14
    expect(bodyBytes).toBeLessThan(aggregateCap)
    const out = prepareMaintenanceCaller({ ...f.envelope, maxOutputBytes: aggregateCap }, descriptor, f.ports)
    expect(out.result.kind).toBe("hold")
    if (out.result.kind !== "hold") throw Error("expected HOLD")
    expect(out.result.evidence).toContain("maintenance-host-output-cap")
    expect(out.accounting.recipeCalls).toEqual(f.keys)
    expect(out.accounting.outputBytes).toBe(bodyBytes * 15)
    expect(out.accounting.capturedBytes).toBe(bodyBytes + new TextEncoder().encode("recipe bytes").byteLength)
    expect(out.releaseReference).toBe(f.envelope.releaseReference)
  })
})
