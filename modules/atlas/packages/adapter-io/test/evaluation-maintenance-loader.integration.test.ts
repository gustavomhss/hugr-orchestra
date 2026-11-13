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


import { createHash } from "node:crypto"
import { vi } from "vitest"
import { loadDescriptor } from "../../../scripts/maintenance-descriptor-loader.mjs"
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
// This orchestration is synthetic test code only, not a released loader/operation launcher.
function loadThenPrepare(bytes: Uint8Array, pin: string, f: ReturnType<typeof fixture>, invoke = prepareMaintenanceCaller) {
  const descriptor = loadDescriptor(bytes, pin)
  return invoke(f.envelope, descriptor, f.ports)
}
function trackPorts(f: ReturnType<typeof fixture>) {
  const observe = vi.fn(f.ports.observe), readCapturedBytes = vi.fn(f.ports.readCapturedBytes)
  const listMembers = vi.fn(f.ports.listMembers), semanticEvidence = vi.fn(f.ports.semanticEvidence)
  const get = vi.fn(f.ports.store.get.bind(f.ports.store)), put = vi.fn(f.ports.store.put.bind(f.ports.store))
  const store = new Proxy(f.ports.store, { get(target, prop, receiver) { return prop === "get" ? get : prop === "put" ? put : Reflect.get(target, prop, receiver) } })
  return { fixture: { ...f, ports: { ...f.ports, store, observe, readCapturedBytes, listMembers, semanticEvidence } }, spies: [observe, readCapturedBytes, listMembers, semanticEvidence, get, put] }
}

describe("strict raw descriptor loader to real caller, host and core, synthetic fifteen entries", () => {
  it("loads pinned JSON and prepares all fifteen changed entries with real envelope/accounting", () => {
    const f = fixture(), bytes = raw(f.change()), out = loadThenPrepare(bytes, sha256(bytes), f)
    expect(out.result.kind).toBe("prepared-evaluation-update")
    if (out.result.kind !== "prepared-evaluation-update") throw Error(JSON.stringify(out.result))
    expect(out.result.prepared.candidate.entries).toHaveLength(15)
    expect(out.result.prepared.candidate_id).toBe(id(out.result.prepared.candidate))
    expect([...out.accounting.recipeCalls].sort()).toEqual([...f.keys].sort())
    expect(out.accounting.outputBytes).toBe(15 * new TextEncoder().encode("new synthetic body").byteLength)
    expect(out.accounting.capturedBytes).toBeGreaterThan(0)
    expect(out.releaseReference).toBe(f.envelope.releaseReference)
    expect(out.accounting.externalProductionUsage).toBe("UNKNOWN")
    expect(out.accounting.physicalModelAttempts).toBe("UNKNOWN")
    expect(out.accounting.currency).toBe("UNKNOWN")
  })
  it("preserves omitted optional fields and allows all-entry reuse without production", () => {
    const f = fixture(), bytes = raw(f.descriptor), d = loadDescriptor(bytes, sha256(bytes))
    expect(Object.getPrototypeOf(d)).toBe(null)
    const out = prepareMaintenanceCaller(f.envelope, d, f.ports)
    expect(out.result.kind).toBe("prepared-evaluation-update")
    expect(out.accounting.recipeCalls).toEqual([])
    expect(out.accounting.outputBytes).toBe(0)
    if (out.result.kind !== "prepared-evaluation-update") throw Error(JSON.stringify(out.result))
    expect(out.result.prepared.candidate.entries.map(x => x.artifact.result)).toEqual(f.ports.baseline.candidate.entries.map(x => x.artifact.result))
  })
  it("freezes the entire parsed tree and detaches it from raw bytes before real production", () => {
    const f = fixture(), bytes = raw(f.change()), d = loadDescriptor(bytes, sha256(bytes))
    const checkFrozen = (value: unknown): void => { if (value !== null && typeof value === "object") { expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) checkFrozen(child) } }
    checkFrozen(d)
    expect(() => Reflect.set(d.produced[0]!.output, "body", "tampered")).not.toThrow()
    expect(Reflect.set(d.produced[0]!.output, "body", "tampered")).toBe(false)
    expect(() => (d.recipes as unknown as unknown[]).push({})).toThrow(TypeError)
    bytes.fill(0)
    expect(d.produced[0]!.output.body).toBe("new synthetic body")
    const out = prepareMaintenanceCaller(f.envelope, d, f.ports)
    expect(out.result.kind).toBe("prepared-evaluation-update")
    expect(out.accounting.recipeCalls).toHaveLength(15)
    expect(out.accounting.outputBytes).toBe(15 * new TextEncoder().encode("new synthetic body").byteLength)
  })
  it.each(["pin", "schema", "duplicate", "unknown-field"] as const)("rejects %s before caller/host and before any port effect", mode => {
    const original = fixture(), descriptor = original.change()
    const { fixture: f, spies } = trackPorts(original)
    let bytes = raw(mode === "schema" ? { ...descriptor, schema: "unknown" } : mode === "unknown-field" ? { ...descriptor, run: "not-code" } : descriptor)
    if (mode === "duplicate") bytes = new TextEncoder().encode(new TextDecoder().decode(bytes).replace('"schema":', '"schema":"evaluation-maintenance-caller/v1","schema":'))
    const pin = mode === "pin" ? "0".repeat(64) : sha256(bytes), invoke = vi.fn(prepareMaintenanceCaller)
    const error = mode === "duplicate" ? "duplicate-or-unsafe-field" : mode
    expect(() => loadThenPrepare(bytes, pin, f, invoke)).toThrow(`descriptor-loader-${error}`)
    expect(invoke).not.toHaveBeenCalled()
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
  it("valid loader input still reaches real core HOLD for missing production", () => {
    const f = fixture(); f.change()
    const bytes = raw(f.descriptor), out = loadThenPrepare(bytes, sha256(bytes), f)
    expect(out.result.kind).toBe("hold")
    if (out.result.kind !== "hold") throw Error("expected HOLD")
    expect(out.result.evidence).toContain("maintenance-caller-missing-production")
    expect(out.accounting.recipeCalls).toHaveLength(1)
    expect(out.accounting.outputBytes).toBe(0)
  })
})
