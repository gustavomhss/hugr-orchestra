import { describe, expect, it } from "vitest"
import { createStore, id } from "@atlas/kernel"
import { OWNERSHIP_ADMISSION_CRITERIA } from "@atlas/knowledge"
import type { EvaluationOwnershipArtifact, EvaluationOwnershipContract, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, EvaluationOwnershipReview, OwnershipEvaluationContext } from "@atlas/knowledge"
import type { EvaluationCandidate, PreparedEvaluation } from "../src/genesis-evaluation.js"
import { evaluationRuntimeIdentity } from "../src/evaluation-runtime-identity.js"
import { prepareMaintenanceCaller } from "../src/evaluation-maintenance-caller.js"
import type { MaintenanceCallerDescriptor, MaintenanceCallerPorts } from "../src/evaluation-maintenance-caller.js"
import type { MaintenanceHostEnvelope } from "../src/evaluation-maintenance-host.js"

// Fifteen-node synthetic chain. Unlike the public independent-node fixture, every
// non-root node has a real receipt edge to its predecessor, backed by a CAS result hash.
function fixture() {
  const store = createStore()
  const current = new Map([["file:source", "s1"], ["file:recipe", "r1"]])
  const source = { body: "old synthetic body" }
  const keys = Array.from({ length: 15 }, (_, i) => `dag-entry-${String(i).padStart(2, "0")}`)
  const predecessors = new Map(keys.slice(1).map((key, i) => [key, keys[i]!]))
  const plan = store.put({ schema: "genesis-evaluation-plan/v1", consumer_ids: ["caller-dag-test"],
    consumer_modes: { test: "routine" }, read_limits: { routine: { index_calls: 2, read_calls: 2, body_bytes_total: 1024 } },
    maintenance: { synthetic: true }, isolation: { root: "/synthetic", original_root: "/original" } })
  const evaluation = { phase: "evaluation" as const, evaluationPlan: plan,
    obligationSet: store.put({ syntheticObligations: "unchanged" }) }
  const contract: EvaluationOwnershipContract = { kind: "ownership-contract", version: 2, evaluation,
    criteria: [...OWNERSHIP_ADMISSION_CRITERIA] }
  const contractHash = store.put(contract)
  const inputsFor = (key: string) => [
    ...(key === keys[0] ? [{ key: "file:source", version: "s1" }] : []),
    { key: "file:recipe", version: "r1" },
  ]
  const resultBody = store.put({ kind: "ownership-body", version: 1,
    bytes: [...new TextEncoder().encode(source.body)] })
  const result = store.put({ kind: "ownership-result", version: 1, body: resultBody,
    authority: { scope: "test.scope", basis: "synthetic" }, validity: "supported", gaps: [], evidence: ["synthetic-only"] })
  const candidate: EvaluationCandidate = {
    kind: "genesis-evaluation-candidate", version: 2, phase: "evaluation", plan_path: "plan.json",
    runtime_identity: evaluationRuntimeIdentity(), evaluation,
    original_candidate: id({ origin: "candidate" }), original_contract: id({ origin: "contract" }),
    repo_root: "/synthetic", observed_head: null, source_revision: "synthetic", scope: "test.scope",
    session: "CALLER-DAG-TEST", reference_commit_verification: "external-capture-evidence-required",
    transport: { path: "package.json", sha256: "a".repeat(64), body: id({ package: "synthetic" }) },
    implementation: {}, references: [],
    observations: [{ key: "file:source", version: "s1" }, { key: "file:recipe", version: "r1" }],
    entries: keys.map(key => {
      const inputs = inputsFor(key)
      const dependencies = predecessors.has(key)
        ? [{ key: predecessors.get(key)!, result }]
        : []
      return {
        key,
        artifact: { kind: "ownership-artifact", version: 1, key, scope: "test.scope",
          title: key, layer: 1, need: "entry", result, navigation: [] },
        inputs, dependencies, inputs_id: id({ inputs, dependencies }), contract: contractHash,
        semanticEvidence: [store.put({ oldSemantic: "a", key }), store.put({ oldSemantic: "b", key })],
      }
    }),
    roots: { entry: keys[0]! }, required_artifact_keys: keys,
  }
  const candidateId = store.put(candidate)
  const context: OwnershipEvaluationContext = {
    evaluation, evaluationCandidate: candidateId, generation: id({ generation: "baseline" }),
  }
  const manifestEntries = candidate.entries.map(entry => {
    const reviews = ["synthetic-reviewer-a", "synthetic-reviewer-b"].map(reviewer => {
      const review: EvaluationOwnershipReview = {
        kind: "ownership-review", version: 2, evaluation, evaluationCandidate: candidateId,
        reviewer, contract: contractHash, inputs: id({ inputs: entry.inputs, dependencies: entry.dependencies }),
        result, criteria: [...OWNERSHIP_ADMISSION_CRITERIA], verdict: "pass",
        provenance: "synthetic baseline fixture only",
      }
      return store.put(review)
    })
    const receipt: EvaluationOwnershipReceipt = {
      kind: "ownership-receipt", version: 2, evaluation, evaluationCandidate: candidateId,
      contract: contractHash, inputs: entry.inputs, dependencies: entry.dependencies, reviews,
    }
    const artifact: EvaluationOwnershipArtifact = {
      ...entry.artifact, version: 2, evaluation, evaluationCandidate: candidateId, receipt: store.put(receipt),
    }
    return { key: entry.key, artifact: store.put(artifact) }
  })
  const manifest: EvaluationOwnershipManifest = {
    kind: "ownership-manifest", version: 2, evaluation, evaluationCandidate: candidateId,
    generation: context.generation, scope: "test.scope", roots: candidate.roots, entries: manifestEntries,
  }
  const baseline: PreparedEvaluation = { schema: "genesis-native-prepared/v2", candidate_id: candidateId, candidate }
  const ports: MaintenanceCallerPorts = {
    store, baseline, manifest: store.put(manifest), context,
    observe: key => current.has(key) ? { kind: "present", version: current.get(key)! } : { kind: "absent" },
    readCapturedBytes: key => new TextEncoder().encode(key === "file:source" ? source.body : "recipe bytes"),
    listMembers: () => [],
    semanticEvidence: (key, target) => [
      store.put({ newSemantic: "a", key, target }),
      store.put({ newSemantic: "b", key, target }),
    ],
  }
  const targetGeneration = id({ generation: "target" })
  const envelope: MaintenanceHostEnvelope = {
    stage: "prepare", candidate: candidateId, targetRoot: "/synthetic-target",
    targetGeneration, maxEntries: 15, maxRecipeCalls: 15,
    maxCapturedBytes: 1048576, maxOutputBytes: 1048576,
    releaseReference: "synthetic-only-no-authority",
  }
  const recipes = keys.map(key => ({
    key, recipeInputKey: "file:recipe", recipeVersion: "r1",
    declaredInputs: key === keys[0] ? ["file:source", "file:recipe"] : ["file:recipe"],
    required: predecessors.has(key) ? [predecessors.get(key)!] : [],
  }))
  const descriptor: MaintenanceCallerDescriptor = {
    schema: "evaluation-maintenance-caller/v1", baselineCandidate: candidateId,
    baselineManifest: ports.manifest, baselineGeneration: context.generation,
    targetRoot: envelope.targetRoot, targetGeneration: envelope.targetGeneration,
    recipes, produced: [],
  }
  const changedDescriptor = (): MaintenanceCallerDescriptor => {
    source.body = "new synthetic root body"
    current.set("file:source", "s2")
    // Core's result hash is deterministic over the stored body and inherited result metadata.
    const newBody = store.put({ kind: "ownership-body", version: 1,
      bytes: [...new TextEncoder().encode(source.body)] })
    const changedRootResult = store.put({ kind: "ownership-result", version: 1, body: newBody,
      authority: { scope: "test.scope", basis: "synthetic" }, validity: "supported", gaps: [], evidence: ["synthetic-only"] })
    const capturedVersions = [{ key: "file:source", version: "s2" }, { key: "file:recipe", version: "r1" }]
    return {
      ...descriptor,
      produced: [
        { key: keys[0]!, capturedVersions, dependencies: [], output: { body: source.body } },
        { key: keys[1]!, capturedVersions, dependencies: [{ key: keys[0]!, result: changedRootResult }], output: { body: "changed child body" } },
        // This node is invoked because its parent changed, but deliberately emits its
        // exact prior body/result. Its child must therefore be reused, not rerun.
        { key: keys[2]!, capturedVersions, dependencies: [{ key: keys[1]!, result: store.put({
          kind: "ownership-result", version: 1,
          body: store.put({ kind: "ownership-body", version: 1, bytes: [...new TextEncoder().encode("changed child body")] }),
          authority: { scope: "test.scope", basis: "synthetic" }, validity: "supported",
          gaps: [], evidence: ["synthetic-only"],
        }) }], output: { body: "old synthetic body" } },
      ],
    }
  }
  return { keys, ports, envelope, descriptor, changedDescriptor }
}

describe("maintenance caller real host/core DAG integration, synthetic fifteen-node chain", () => {
  it("proves real topological propagation and stops propagation when an intermediate result is unchanged", () => {
    const f = fixture()
    const descriptor = f.changedDescriptor()
    const out = prepareMaintenanceCaller(f.envelope, descriptor, f.ports)

    expect(out.result.kind).toBe("prepared-evaluation-update")
    expect(out.accounting.recipeCalls).toEqual([f.keys[0], f.keys[1], f.keys[2]])
    expect(out.accounting.recipeCalls).not.toContain(f.keys[3])
    expect(out.accounting.outputBytes).toBe(
      new TextEncoder().encode("new synthetic root body").byteLength +
      new TextEncoder().encode("changed child body").byteLength +
      new TextEncoder().encode("old synthetic body").byteLength,
    )
    expect(out.accounting.capturedBytes).toBeGreaterThan(0)
    expect(out.accounting.externalProductionUsage).toBe("UNKNOWN")
    if (out.result.kind !== "prepared-evaluation-update") throw Error(JSON.stringify(out.result))
    expect(out.result.affected).toEqual(f.keys)
    expect(out.result.calls).toEqual([f.keys[0], f.keys[1], f.keys[2]])
    expect(out.result.prepared.candidate.entries).toHaveLength(15)
    expect(out.result.prepared.candidate_id).toBe(id(out.result.prepared.candidate))
    expect(out.result.prepared.candidate_id).not.toBe(f.ports.baseline.candidate_id)
    expect(out.result.prepared.candidate.entries[3]!.artifact.result)
      .toBe(f.ports.baseline.candidate.entries[3]!.artifact.result)
    expect(out.releaseReference).toBe(f.envelope.releaseReference)
  })

  it("reuses the entire graph with no recipe calls when no captured input changed", () => {
    const f = fixture()
    const out = prepareMaintenanceCaller(f.envelope, f.descriptor, f.ports)
    expect(out.result.kind).toBe("evaluation-reuse")
    expect(out.accounting.recipeCalls).toEqual([])
    expect(out.accounting.outputBytes).toBe(0)
    if (out.result.kind !== "evaluation-reuse") throw Error(JSON.stringify(out.result))
    expect(out.result.manifest).toBe(f.ports.manifest)
  })
})
