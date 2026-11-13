import { describe, expect, it } from "vitest"
import { createStore, id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { indexOwnership, readOwnership } from "../src/ownership/read.js"
import { planOwnershipUpdate } from "../src/ownership/update-plan.js"
import { OWNERSHIP_ADMISSION_CRITERIA } from "../src/ownership/evaluation.js"
import { isEvaluationOwnershipContract, isEvaluationOwnershipManifest, isOwnershipManifest } from "../src/ownership/shape.js"
import type { EvaluationOwnershipArtifact, EvaluationOwnershipContract, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, EvaluationOwnershipReview, OwnershipEvaluationContext } from "../src/ownership/types.js"

// Synthetic CI fixture only. These decisions do not represent campaign reviewers or acceptance.
function fixture(options: { reviewCount?: number; duplicateReviewer?: boolean; hold?: boolean; reviewCandidate?: Hash; contractCriteria?: readonly string[] } = {}) {
  const store = createStore()
  const evaluation = { phase: "evaluation" as const, evaluationPlan: id({ plan: "test-only" }), obligationSet: id({ obligations: "unchanged-test-only" }) }
  const evaluationCandidate = id({ candidate: "test-only" })
  const context: OwnershipEvaluationContext = { evaluation, evaluationCandidate, generation: id({ generation: "test-only" }) }
  const body = store.put({ kind: "ownership-body", version: 1, bytes: [...new TextEncoder().encode("# Test\n\n## Purpose\nfixture only\n")] })
  const result = store.put({ kind: "ownership-result", version: 1, body, authority: { scope: "unit", basis: "synthetic fixture" }, validity: "supported", gaps: [], evidence: ["synthetic fixture, not acceptance"] })
  const contract: EvaluationOwnershipContract = { kind: "ownership-contract", version: 2, evaluation, criteria: options.contractCriteria ?? [...OWNERSHIP_ADMISSION_CRITERIA] }
  const contractRef = store.put(contract)
  const inputs = [{ key: "file:input", version: "v1" }]
  const dependencies: readonly { key: string; result: Hash }[] = []
  const reviews = Array.from({ length: options.reviewCount ?? 2 }, (_, index) => {
    const review: EvaluationOwnershipReview = { kind: "ownership-review", version: 2, evaluation,
      evaluationCandidate: options.reviewCandidate ?? evaluationCandidate, reviewer: options.duplicateReviewer ? "test-reviewer" : `test-reviewer-${index}`,
      contract: contractRef, inputs: id({ inputs, dependencies }), result, criteria: [...contract.criteria],
      verdict: options.hold ? "hold" : "pass", provenance: `synthetic fixture decision ${index}, not a campaign vote` }
    return store.put(review)
  })
  const receipt: EvaluationOwnershipReceipt = { kind: "ownership-receipt", version: 2, evaluation, evaluationCandidate, contract: contractRef, inputs, dependencies, reviews }
  const artifact: EvaluationOwnershipArtifact = { kind: "ownership-artifact", version: 2, evaluation, evaluationCandidate, key: "entry", scope: "unit", title: "Test", layer: 1, need: "entry", result, receipt: store.put(receipt), navigation: [] }
  const manifest: EvaluationOwnershipManifest = { kind: "ownership-manifest", version: 2, evaluation, evaluationCandidate, generation: context.generation, scope: "unit", entries: [{ key: "entry", artifact: store.put(artifact) }], roots: { entry: "entry" } }
  const ref = store.put(manifest)
  const query = { scope: "unit", key: "entry", maxBytes: 1000 }
  return { store, context, ref, manifest, artifact, receipt, contract, query }
}

describe("evaluation ownership authority, synthetic CI only", () => {
  it("returns labelled HOLD for a missing explicit key rather than throwing", () => {
    const f = fixture()
    expect(readOwnership(f.store, f.ref, { ...f.query, key: "does-not-exist" }, () => "v1", f.context))
      .toMatchObject({ kind: "hold", reason: "ownership-selection", evaluation: { evaluationCandidate: f.context.evaluationCandidate } })
  })

  it("uses the same resolver, labels reads/index/plans and retains final-obligation reference", () => {
    const f = fixture()
    const read = readOwnership(f.store, f.ref, f.query, () => "v1", f.context)
    expect(read.kind).toBe("ready")
    expect(read.evaluation).toEqual({ ...f.context.evaluation, evaluationCandidate: f.context.evaluationCandidate, generation: f.context.generation, manifest: f.ref })
    const index = indexOwnership(f.store, f.ref, { scope: "unit", need: "entry" }, () => "v1", f.context)
    expect(index.kind).toBe("index")
    expect(index.evaluation).toEqual(read.evaluation)
    const plan = planOwnershipUpdate(f.store, f.ref, "unit", () => ({ kind: "present", version: "v2" }), f.context)
    expect(plan.kind).toBe("ownership-update-plan")
    expect(plan.evaluation).toEqual(read.evaluation)
  })

  it("denies evaluation through default operational read/index/planner and legacy parser", () => {
    const f = fixture()
    expect(readOwnership(f.store, f.ref, f.query, () => "v1").kind).toBe("hold")
    expect(indexOwnership(f.store, f.ref, { scope: "unit", need: "entry" }, () => "v1").kind).toBe("hold")
    expect(planOwnershipUpdate(f.store, f.ref, "unit", () => ({ kind: "present", version: "v1" })).kind).toBe("hold")
    expect(isOwnershipManifest(f.manifest)).toBe(false)
    expect(isEvaluationOwnershipManifest(f.manifest)).toBe(true)
  })

  it.each([0, 1, 3])("requires exactly two reviews, not %s", (reviewCount) => {
    const f = fixture({ reviewCount })
    expect(readOwnership(f.store, f.ref, f.query, () => "v1", f.context).kind).toBe("hold")
  })

  it("rejects duplicate reviewers and HOLD", () => {
    for (const options of [{ duplicateReviewer: true }, { hold: true }]) {
      const f = fixture(options)
      expect(readOwnership(f.store, f.ref, f.query, () => "v1", f.context).kind).toBe("hold")
    }
  })

  it("rejects old candidate review reuse, changed generation and mismatched plan", () => {
    const f = fixture({ reviewCandidate: id({ candidate: "other" }) })
    expect(readOwnership(f.store, f.ref, f.query, () => "v1", f.context).kind).toBe("hold")
    const g = fixture()
    for (const context of [{ ...g.context, generation: id({ wrong: "generation" }) }, { ...g.context, evaluation: { ...g.context.evaluation, evaluationPlan: id({ wrong: "plan" }) } }]) {
      const read = readOwnership(g.store, g.ref, g.query, () => "v1", context)
      expect(read.kind).toBe("hold")
      expect(read.evaluation?.phase).toBe("evaluation")
    }
  })

  it("never accepts AC PASS as the admission contract", () => {
    const f = fixture({ contractCriteria: ["AC-01", "AC-02", "runtime-import-binding"] })
    expect(isEvaluationOwnershipContract(f.contract)).toBe(false)
    expect(readOwnership(f.store, f.ref, f.query, () => "v1", f.context).kind).toBe("hold")
  })

  it("preserves drift and limit refusals with evaluation labels", () => {
    const f = fixture()
    for (const read of [readOwnership(f.store, f.ref, f.query, () => "changed", f.context), readOwnership(f.store, f.ref, { ...f.query, maxBytes: 1 }, () => "v1", f.context)]) {
      expect(read.kind).toBe("hold")
      expect(read.evaluation?.evaluationCandidate).toBe(f.context.evaluationCandidate)
    }
    const historical = readOwnership(f.store, f.ref, { ...f.query, historical: true }, () => undefined, f.context)
    expect(historical.kind === "ready" && historical.historical).toBe(true)
  })

  it("rejects mixed v1 artifacts even when wrapped by an evaluation manifest", () => {
    const f = fixture()
    const { evaluation: _evaluation, evaluationCandidate: _candidate, ...payload } = f.artifact
    const legacy = f.store.put({ ...payload, version: 1 })
    const mixed = f.store.put({ ...f.manifest, entries: [{ key: "entry", artifact: legacy }] })
    expect(readOwnership(f.store, mixed, f.query, () => "v1", f.context).kind).toBe("hold")
  })

  it("rejects unknown version/fields and descriptor stripping", () => {
    const f = fixture()
    expect(isEvaluationOwnershipManifest({ ...f.manifest, extra: "ignored?" })).toBe(false)
    expect(isEvaluationOwnershipManifest({ ...f.manifest, version: 3 })).toBe(false)
    const { evaluation: _evaluation, ...stripped } = f.manifest
    expect(isEvaluationOwnershipManifest(stripped)).toBe(false)
    expect(isOwnershipManifest({ ...f.manifest, version: 1 })).toBe(false)
  })

  it("retains navigation as non-build metadata", () => {
    const f = fixture()
    const changed = f.store.put({ ...f.artifact, navigation: ["elsewhere"] })
    const manifest = f.store.put({ ...f.manifest, entries: [{ key: "entry", artifact: changed }] })
    const plan = planOwnershipUpdate(f.store, manifest, "unit", () => ({ kind: "present", version: "v1" }), f.context)
    expect(plan.kind === "ownership-update-plan" && plan.affected).toEqual([])
  })

  it("retains v1 behavior but never serves v1 under evaluation context", () => {
    const f = fixture()
    const contract = f.store.put({ kind: "ownership-contract", version: 1, criteria: ["legacy-test-only"] })
    const reviews = ["legacy-a", "legacy-b"].map((reviewer) => f.store.put({ kind: "ownership-review", version: 1, reviewer,
      contract, inputs: id({ inputs: f.receipt.inputs, dependencies: f.receipt.dependencies }), result: f.artifact.result,
      criteria: ["legacy-test-only"], verdict: "pass", provenance: "synthetic legacy fixture" }))
    const receipt = f.store.put({ kind: "ownership-receipt", version: 1, contract, inputs: f.receipt.inputs, dependencies: [], reviews })
    const artifact = f.store.put({ kind: "ownership-artifact", version: 1, key: "entry", scope: "unit", title: "Legacy", layer: 1,
      need: "entry", result: f.artifact.result, receipt, navigation: [] })
    const manifest = f.store.put({ kind: "ownership-manifest", version: 1, scope: "unit", entries: [{ key: "entry", artifact }], roots: { entry: "entry" } })
    expect(readOwnership(f.store, manifest, f.query, () => "v1").kind).toBe("ready")
    expect(readOwnership(f.store, manifest, f.query, () => "v1", f.context).kind).toBe("hold")
  })

  it("changes identity when evaluation authority changes", () => {
    const f = fixture()
    expect(id({ ...f.manifest, evaluationCandidate: id({ candidate: "new" }) })).not.toBe(f.ref)
    expect(id({ ...f.manifest, generation: id({ generation: "new" }) })).not.toBe(f.ref)
    expect(id({ ...f.contract, evaluation: { ...f.context.evaluation, obligationSet: id({ obligations: "different" }) } })).not.toBe(id(f.contract))
  })


  it("rejects a disconnected entry with a different evaluation authority", () => {
    const f = fixture()
    const extra = f.store.put({ ...f.artifact, key: "disconnected", evaluationCandidate: id({ candidate: "wrong" }) })
    const manifest = f.store.put({ ...f.manifest, entries: [...f.manifest.entries, { key: "disconnected", artifact: extra }] })
    expect(readOwnership(f.store, manifest, f.query, () => "v1", f.context).kind).toBe("hold")
    expect(indexOwnership(f.store, manifest, { scope: "unit", need: "entry" }, () => "v1", f.context).kind).toBe("hold")
  })

  it("never supplies bytes for a missing declared input", () => {
    const f = fixture()
    const read = readOwnership(f.store, f.ref, f.query, () => undefined, f.context)
    expect(read.kind).toBe("hold")
    expect("body" in read).toBe(false)
    expect(read.evaluation?.phase).toBe("evaluation")
  })

})
