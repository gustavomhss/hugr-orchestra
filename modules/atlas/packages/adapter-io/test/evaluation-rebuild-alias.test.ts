import { describe, expect, it } from "vitest"
import { createStore, id } from "@atlas/kernel"
import type { OwnershipRecipeInput } from "../src/ownership-rebuild.js"
import { OWNERSHIP_ADMISSION_CRITERIA, readOwnership } from "@atlas/knowledge"
import type { EvaluationOwnershipArtifact, EvaluationOwnershipContract, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, EvaluationOwnershipReview, OwnershipEvaluationContext } from "@atlas/knowledge"
import type { EvaluationCandidate, PreparedEvaluation } from "../src/genesis-evaluation.js"
import type { EvaluationBinding } from "../src/genesis-evaluation-binding.js"
import { prepareEvaluationUpdate, finalizeEvaluationUpdate } from "../src/evaluation-rebuild.js"
import type { EvaluationRebuildRequest, PreparedEvaluationUpdate } from "../src/evaluation-rebuild.js"
import { evaluationRuntimeIdentity } from "../src/evaluation-runtime-identity.js"
import { nativeSha256 } from "../src/genesis-native-io.js"

// Synthetic fixtures ONLY: neither votes nor runtime operations for the Genesis campaign.
function fixture() {
  const store = createStore(), current = new Map([ ["file:source", "s1"], ["file:recipe", "r1"] ])
  const source = { body: "old body" }, calls: string[] = []
  const plan = store.put({ schema: "genesis-evaluation-plan/v1", consumer_ids: ["test"], consumer_modes: { test: "routine" }, read_limits: { routine: { index_calls: 2, read_calls: 2, body_bytes_total: 1024 } }, maintenance: { synthetic: true }, isolation: { root: "/synthetic", original_root: "/original" } })
  const evaluation = { phase: "evaluation" as const, evaluationPlan: plan, obligationSet: store.put({ obligations: "unchanged synthetic" }) }
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
    entries: [{ key: "entry", artifact: { kind: "ownership-artifact", version: 1, key: "entry", scope: "test.scope", title: "Synthetic", layer: 1, need: "entry", result, navigation: [] },
      inputs, dependencies, inputs_id: inputsId, contract: contractHash, semanticEvidence: [store.put({ oldSemantic: "a" }), store.put({ oldSemantic: "b" })] }],
    roots: { entry: "entry" }, required_artifact_keys: ["entry"],
  }
  const candidateId = store.put(candidate), context: OwnershipEvaluationContext = { evaluation, evaluationCandidate: candidateId, generation: id({ generation: "baseline" }) }
  const reviews = ["synthetic-a", "synthetic-b"].map((reviewer) => {
    const review: EvaluationOwnershipReview = { kind: "ownership-review", version: 2, evaluation, evaluationCandidate: candidateId, reviewer,
      contract: contractHash, inputs: inputsId, result, criteria: [...OWNERSHIP_ADMISSION_CRITERIA], verdict: "pass", provenance: "synthetic baseline fixture only" }
    return store.put(review)
  })
  const receipt: EvaluationOwnershipReceipt = { kind: "ownership-receipt", version: 2, evaluation, evaluationCandidate: candidateId, contract: contractHash, inputs, dependencies, reviews }
  const artifact: EvaluationOwnershipArtifact = { ...candidate.entries[0]!.artifact, version: 2, evaluation, evaluationCandidate: candidateId, receipt: store.put(receipt) }
  const manifest: EvaluationOwnershipManifest = { kind: "ownership-manifest", version: 2, evaluation, evaluationCandidate: candidateId, generation: context.generation,
    scope: "test.scope", roots: { entry: "entry" }, entries: [{ key: "entry", artifact: store.put(artifact) }] }
  const prepared: PreparedEvaluation = { schema: "genesis-native-prepared/v2", candidate_id: candidateId, candidate }
  const request: EvaluationRebuildRequest = { store, baseline: prepared, manifest: store.put(manifest), context, targetGeneration: id({ generation: "target" }),
    recipes: new Map([["entry", { key: "entry", recipeInputKey: "file:recipe", recipeVersion: "r1", declaredInputs: ["file:source", "file:recipe"], required: [],
      run: (input: OwnershipRecipeInput) => { calls.push("entry"); return { body: new TextDecoder().decode(input.bytes.get("file:source")) } } }]]),
    observe: (key) => current.has(key) ? { kind: "present", version: current.get(key)! } : { kind: "absent" },
    readCapturedBytes: (key) => new TextEncoder().encode(key === "file:source" ? source.body : "recipe bytes"), listMembers: () => [],
    semanticEvidence: (key, target) => [store.put({ newSemantic: "a", key, target }), store.put({ newSemantic: "b", key, target })] }
  return { store, current, source, calls, request }
}

function decisions(target: PreparedEvaluationUpdate) {
  const requestBytes = new TextEncoder().encode("synthetic new exact rebuild request"), responses = ["a", "b"].map((suffix) => new TextEncoder().encode(`synthetic response ${suffix}`))
  const binding: EvaluationBinding = { schema: "genesis-evaluation-binding/v1", purpose: "isolated-evaluation-admission", candidate_id: target.prepared.candidate_id,
    reviewers: ["new-synthetic-a", "new-synthetic-b"], decisions: ["a", "b"].map((suffix, index) => ({
      reviewer: `new-synthetic-${suffix}`, decision_id: `sha256:${nativeSha256(responses[index]!)}`, purpose: "isolated-evaluation-admission", candidate_id: target.prepared.candidate_id, verdict: "PASS",
      entries: target.prepared.candidate.entries.map((entry) => ({ key: entry.key, contract: entry.contract, result: entry.artifact.result, inputs: entry.inputs_id,
        criteria: OWNERSHIP_ADMISSION_CRITERIA.map((criterion) => ({ id: criterion, verdict: "PASS" })) })),
      request_ref: { payload_path: "request.txt", sha256: nativeSha256(requestBytes) }, response_ref: { payload_path: `${index}.txt`, sha256: nativeSha256(responses[index]!) },
    })) }
  return { binding, readReference: (ref: { sha256: string }) => ref.sha256 === nativeSha256(requestBytes) ? requestBytes : responses.find((bytes) => nativeSha256(bytes) === ref.sha256)! }
}

function changed() {
  const f = fixture()
  f.source.body = "new body"; f.current.set("file:source", "s2")
  const target = prepareEvaluationUpdate(f.request)
  if (target.kind !== "prepared-evaluation-update") throw new Error(`fixture target refused: ${JSON.stringify(target)}`)
  return { ...f, target }
}

describe("two-stage private evaluation rebuild, synthetic CI only", () => {
  it("exact reuse makes zero recipe calls and retains baseline manifest", () => {
    const f = fixture(), result = prepareEvaluationUpdate(f.request)
    expect(result.kind).toBe("evaluation-reuse")
    expect(f.calls).toEqual([])
    expect(result.kind === "evaluation-reuse" && result.manifest).toBe(f.request.manifest)
  })

  it("produces new candidate before new exact reviews, then only a private phase-preserving manifest", () => {
    const f = changed()
    expect(f.target.prepared.candidate_id).not.toBe(f.request.baseline.candidate_id)
    expect(f.target.prepared.candidate.evaluation.obligationSet).toBe(f.request.context.evaluation.obligationSet)
    expect(f.calls).toEqual(["entry"])
    const evidence = decisions(f.target)
    const result = finalizeEvaluationUpdate({ store: f.store, target: f.target, ...evidence, current: (key) => f.current.get(key) })
    expect(result.kind).toBe("private-evaluation-candidate")
    if (result.kind !== "private-evaluation-candidate") return
    const read = readOwnership(f.store, result.manifest, { scope: "test.scope", key: "entry", maxBytes: 1024 }, (key) => f.current.get(key), result.context)
    expect(read.kind === "ready" && read.body).toBe("new body")
    expect(readOwnership(f.store, result.manifest, { scope: "test.scope", key: "entry", maxBytes: 1024 }, (key) => f.current.get(key)).kind).toBe("hold")
  })

  it("will not inherit historical semantic evidence for changed results", () => {
    const f = fixture(); f.source.body = "changed"; f.current.set("file:source", "s2")
    const result = prepareEvaluationUpdate({ ...f.request, semanticEvidence: () => f.request.baseline.candidate.entries[0]!.semanticEvidence })
    expect(result.kind).toBe("hold")
  })

  it("rejects omitted recipe dependency and unavailable mandatory source", () => {
    const f = fixture(), recipe = f.request.recipes.get("entry")!
    expect(prepareEvaluationUpdate({ ...f.request, recipes: new Map([["entry", { ...recipe, required: ["missing"] }]]) }).kind).toBe("hold")
    f.current.delete("file:source")
    expect(prepareEvaluationUpdate(f.request).kind).toBe("hold")
  })

  it("refuses input drift after target production before finalization", () => {
    const f = changed(), evidence = decisions(f.target)
    f.current.set("file:source", "s3")
    expect(finalizeEvaluationUpdate({ store: f.store, target: f.target, ...evidence, current: (key) => f.current.get(key) }).kind).toBe("hold")
  })

  it("rejects baseline candidate decisions and corrupt response evidence", () => {
    const f = changed(), evidence = decisions(f.target)
    expect(finalizeEvaluationUpdate({ store: f.store, target: f.target, ...evidence, binding: { ...evidence.binding, candidate_id: f.request.baseline.candidate_id }, current: (key) => f.current.get(key) }).kind).toBe("hold")
    expect(finalizeEvaluationUpdate({ store: f.store, target: f.target, binding: evidence.binding, readReference: () => new Uint8Array([1]), current: (key) => f.current.get(key) })).toMatchObject({ kind: "hold", evidence: ["evaluation-rebuild-reference-drift"] })
  })

  it("binds a separate target root without mutating or silently moving baseline authority", () => {
    const f = fixture()
    const target = prepareEvaluationUpdate({ ...f.request, targetRepoRoot: "/synthetic-target" })
    expect(target.kind).toBe("prepared-evaluation-update")
    if (target.kind !== "prepared-evaluation-update") return
    expect(target.prepared.candidate.repo_root).toBe("/synthetic-target")
    expect(target.prepared.candidate_id).not.toBe(f.request.baseline.candidate_id)
    expect(f.calls).toEqual([])
    expect(f.request.baseline.candidate.repo_root).toBe("/synthetic")
    expect(prepareEvaluationUpdate({ ...f.request, targetRepoRoot: "/synthetic/child" }).kind).toBe("hold")
  })

})

describe("finalize candidate alias isolation", () => {
  it("returns HOLD if an adversarial callback mutates the CAS-backed candidate through an alias", () => {
    const f = changed(), evidence = decisions(f.target)
    const original = f.target.prepared.candidate
    const result = finalizeEvaluationUpdate({ store: f.store, target: f.target, ...evidence, current: (key) => {
      Reflect.set(original.entries[0]!.artifact, "title", "callback-corrupted-title")
      Reflect.set(original.entries[0]!, "semanticEvidence", ["callback-corrupted-evidence"])
      Reflect.set(original.observations[0]!, "version", "callback-corrupted-version")
      Reflect.set(original.evaluation, "evaluationPlan", "callback-corrupted-plan")
      return f.current.get(key)
    } })
    expect(result).toMatchObject({ kind: "hold", evidence: ["evaluation-target-integrity-after-callback"] })
    // The caller-owned alias remains mutated; no rollback is claimed.
    expect(original.entries[0]!.artifact.title).toBe("callback-corrupted-title")
  })

  it("returns a deeply detached, frozen graph when callbacks leave source aliases intact", () => {
    const f = changed(), evidence = decisions(f.target)
    const original = f.target.prepared.candidate
    const expectedTitle = original.entries[0]!.artifact.title
    const expectedVersion = original.observations[0]!.version
    const result = finalizeEvaluationUpdate({ store: f.store, target: f.target, ...evidence,
      current: (key) => f.current.get(key) })
    expect(result.kind).toBe("private-evaluation-candidate")
    if (result.kind !== "private-evaluation-candidate") return
    expect(result.prepared.candidate.entries[0]!.artifact.title).toBe(expectedTitle)
    expect(result.prepared.candidate.observations[0]!.version).toBe(expectedVersion)
    expect(result.prepared.candidate_id).toBe(f.target.prepared.candidate_id)
    expect(result.prepared.candidate).not.toBe(original)
    expect(Object.isFrozen(result.prepared.candidate)).toBe(true)
    expect(Object.isFrozen(result.prepared.candidate.entries[0]!.artifact)).toBe(true)
    expect(Object.isFrozen(result.prepared.candidate.entries[0]!.semanticEvidence)).toBe(true)
    expect(Object.isFrozen(result.prepared.candidate.observations[0])).toBe(true)
    expect(Reflect.set(result.prepared.candidate.entries[0]!.artifact, "title", "post-finalize")).toBe(false)
  })

  it("does not claim rollback after a callback mutates the caller-owned source candidate", () => {
    const f = changed(), evidence = decisions(f.target)
    const original = f.target.prepared.candidate
    const result = finalizeEvaluationUpdate({ store: f.store, target: f.target, ...evidence, current: (key) => {
      Reflect.set(original.entries[0]!.artifact, "title", "caller-side-mutation")
      return f.current.get(key)
    } })
    expect(result.kind).toBe("hold")
    expect(original.entries[0]!.artifact.title).toBe("caller-side-mutation")
  })
})

describe("finalize decision snapshot and failure boundary", () => {
  it("keeps validated decisions stable when a reference callback mutates caller binding aliases", () => {
    const f = changed(), evidence = decisions(f.target)
    const originalReviewer = evidence.binding.decisions[0]!.reviewer
    const originalDecision = evidence.binding.decisions[0]!.decision_id
    const result = finalizeEvaluationUpdate({ store: f.store, target: f.target, ...evidence,
      readReference: (reference) => {
        Reflect.set(evidence.binding.decisions[0]!, "reviewer", "attacker-reviewer")
        Reflect.set(evidence.binding.decisions[0]!, "decision_id", "sha256:attacker")
        Reflect.set(evidence.binding.decisions[0]!.entries[0]!, "result", "attacker-result")
        // The exact reference object passed to the callback is frozen as part of the snapshot.
        expect(Reflect.set(reference, "sha256", "0".repeat(64))).toBe(false)
        return reference.sha256 === nativeSha256(new TextEncoder().encode("synthetic new exact rebuild request"))
          ? new TextEncoder().encode("synthetic new exact rebuild request")
          : new TextEncoder().encode("synthetic response a")
      },
      current: (key) => f.current.get(key) })
    expect(result.kind).toBe("private-evaluation-candidate")
    if (result.kind !== "private-evaluation-candidate") return
    const manifest = f.store.get(result.manifest) as EvaluationOwnershipManifest
    const storedArtifact = f.store.get(manifest.entries[0]!.artifact) as EvaluationOwnershipArtifact
    const receipt = f.store.get(storedArtifact.receipt) as EvaluationOwnershipReceipt
    const reviewers = receipt.reviews.map(hash => (f.store.get(hash) as EvaluationOwnershipReview).reviewer)
    expect(reviewers).toContain(originalReviewer)
    expect(reviewers).not.toContain("attacker-reviewer")
    expect(evidence.binding.decisions[0]!.decision_id).toBe("sha256:attacker")
    expect(originalDecision).not.toBe("sha256:attacker")
  })

  it("converts a snapshot/clone failure into HOLD instead of throwing outside finalize", () => {
    const f = changed(), evidence = decisions(f.target)
    const hostile = new Proxy(f.target.prepared.candidate, { getPrototypeOf() { throw new Error("synthetic-snapshot-trap") } })
    const target = { ...f.target, prepared: { ...f.target.prepared, candidate: hostile } } as unknown as PreparedEvaluationUpdate
    expect(() => finalizeEvaluationUpdate({ store: f.store, target, ...evidence,
      current: (key) => f.current.get(key) })).not.toThrow()
    expect(finalizeEvaluationUpdate({ store: f.store, target, ...evidence,
      current: (key) => f.current.get(key) })).toMatchObject({ kind: "hold", evidence: ["synthetic-snapshot-trap"] })
  })
})
