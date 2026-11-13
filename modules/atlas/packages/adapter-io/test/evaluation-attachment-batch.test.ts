import { beforeEach, describe, expect, it, vi } from "vitest"
import { createStore, id } from "@atlas/kernel"
import { OWNERSHIP_ADMISSION_CRITERIA, readOwnership } from "@atlas/knowledge"
import type { EvaluationOwnershipArtifact, EvaluationOwnershipContract, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, EvaluationOwnershipReview, OwnershipEvaluationContext } from "@atlas/knowledge"
import { ownershipAttachmentRefusal } from "../src/ownership-attachment.js"
const gates = vi.hoisted(() => ({ policy: vi.fn(), binding: vi.fn() }))
vi.mock("../src/ownership-evaluation-policy.js", () => ({ assertEvaluationComposition: gates.policy }))
vi.mock("../src/evaluation-manifest-binding.js", () => ({ evaluationManifestRefusal: gates.binding }))
vi.mock("../src/ownership-access.js", () => ({ evaluationOwnershipClaim: () => "synthetic-evaluation", ownershipClaim: () => "synthetic-operational" }))
// Only outer policy/binding/claim helpers are mocked. Integral read and coverage helper are REAL.
// Not evidence for real policy, candidate binding, filesystem or governed check/emit integration.
function fixture(bad: "none" | "body" | "review" | "dependency" | "phase" = "none", shared = false) {
  const store = createStore(), keys = ["selected", "disconnected"], current = new Map(keys.map((key) => [`file:${key}`, "v1"]))
  const evaluation = { phase: "evaluation" as const, evaluationPlan: id({ synthetic: "plan" }), obligationSet: id({ synthetic: "obligations" }) }
  const context: OwnershipEvaluationContext = { evaluation, evaluationCandidate: id({ synthetic: "candidate" }), generation: id({ synthetic: "generation" }) }
  const contract: EvaluationOwnershipContract = { kind: "ownership-contract", version: 2, evaluation, criteria: [...OWNERSHIP_ADMISSION_CRITERIA] }
  const contractRef = store.put(contract)
  const entries = keys.map((key) => {
    const broken = key === "disconnected"
    const body = store.put({ kind: "ownership-body", version: 1, bytes: broken && bad === "body" ? [255] : [...new TextEncoder().encode(key)] })
    const result = store.put({ kind: "ownership-result", version: 1, body, authority: { scope: "test.scope", basis: "synthetic" }, validity: "supported", gaps: [], evidence: ["synthetic"] })
    const inputs = [{ key: shared ? "file:selected" : `file:${key}`, version: "v1" }]
    const dependencies = broken && bad === "dependency" ? [{ key: "missing", result }] : []
    const reviews = ["test-a", "test-b"].map((reviewer) => {
      const review: EvaluationOwnershipReview = { kind: "ownership-review", version: 2, evaluation, evaluationCandidate: context.evaluationCandidate, reviewer,
        contract: contractRef, inputs: id({ inputs, dependencies }), result,
        criteria: broken && bad === "review" ? [...OWNERSHIP_ADMISSION_CRITERIA].slice(1) : [...OWNERSHIP_ADMISSION_CRITERIA], verdict: "pass", provenance: "synthetic only" }
      return store.put(review)
    })
    const receipt: EvaluationOwnershipReceipt = { kind: "ownership-receipt", version: 2, evaluation, evaluationCandidate: context.evaluationCandidate, contract: contractRef, inputs, dependencies, reviews }
    const artifact: EvaluationOwnershipArtifact = { kind: "ownership-artifact", version: 2, evaluation,
      evaluationCandidate: broken && bad === "phase" ? id({ synthetic: "wrong" }) : context.evaluationCandidate,
      key, scope: "test.scope", title: key, layer: 1, need: "entry", result, navigation: [], receipt: store.put(receipt) }
    return { key, artifact: store.put(artifact) }
  })
  const manifest: EvaluationOwnershipManifest = { kind: "ownership-manifest", version: 2, evaluation, evaluationCandidate: context.evaluationCandidate,
    generation: context.generation, scope: "test.scope", roots: { entry: keys[0]! }, entries }
  return { store, keys, current, context, manifest: store.put(manifest) }
}

function attach(f: ReturnType<typeof fixture>, current = (key: string) => f.current.get(key), assert = () => undefined) {
  const node = { kind: "advisory", predicateSlot: "ownership", scope: "test.scope", claimNorm: "synthetic-evaluation", ownership: f.manifest } as unknown as Parameters<typeof ownershipAttachmentRefusal>[0]
  const access = { root: "/synthetic", scope: "test.scope", context: f.context, assert } as unknown as NonNullable<Parameters<typeof ownershipAttachmentRefusal>[3]>
  return ownershipAttachmentRefusal(node, f.store as unknown as Parameters<typeof ownershipAttachmentRefusal>[1], current, access)
}
beforeEach(() => { gates.policy.mockReset(); gates.binding.mockReset() })
describe("evaluation attachment integral batch, synthetic", () => {
  it("observes both disconnected entries once per attachment", () => {
    const f = fixture(); let calls = 0
    expect(attach(f, key => { calls++; return f.current.get(key) })).toBeUndefined()
    expect(calls).toBe(2)
  })
  for (const bad of ["body", "review", "dependency", "phase"] as const) {
    it(`refuses disconnected ${bad}`, () => {
      const reasons = { body: "malformed-ownership", review: "ownership-review", dependency: "ownership-missing", phase: "ownership-phase" }
      expect(attach(fixture(bad))).toBe(`evaluation-attachment: ${reasons[bad]}`)
    })
  }
  it("uses fresh inputs at each attachment, including a later emission gate", () => {
    const f = fixture(); expect(attach(f)).toBeUndefined()
    f.current.set("file:disconnected", "v2")
    expect(attach(f)).toBe("evaluation-attachment: ownership-input-changed")
  })
  it("keeps policy before binding and current reads", () => {
    const f = fixture(), current = vi.fn(); gates.policy.mockImplementation(() => { throw new Error("denied") })
    expect(attach(f, current)).toBe("evaluation-policy-denied")
    expect(gates.binding).not.toHaveBeenCalled(); expect(current).not.toHaveBeenCalled()
  })
  it("keeps binding refusal before integral traversal", () => {
    const f = fixture(), current = vi.fn(); gates.binding.mockReturnValue("evaluation-input-drift")
    expect(attach(f, current)).toBe("evaluation-input-drift"); expect(current).not.toHaveBeenCalled()
  })
  it("preserves unexpected observer failure rather than masking it", () => {
    const error = new Error("synthetic unavailable")
    expect(() => attach(fixture(), () => { throw error })).toThrow(error)
  })
})

describe("attachment boundaries and temporal sampling, synthetic unit only", () => {
  it("documents reduced sampling rather than claiming atomicity", () => {
    const f = fixture(); let calls = 0
    expect(attach(f, key => ++calls > 2 ? "v2" : f.current.get(key))).toBeUndefined()
    calls = 0
    const previous = f.keys.map(key => readOwnership(f.store, f.manifest, { scope: "test.scope", key, maxBytes: Number.MAX_SAFE_INTEGER }, input => ++calls > 2 ? "v2" : f.current.get(input), f.context))
    expect(previous.map(r => r.kind)).toEqual(["ready", "hold"])
  })
  it("does not deduplicate input observations across distinct receipts", () => {
    const f = fixture("none", true), seen: string[] = []
    expect(attach(f, key => { seen.push(key); return f.current.get(key) })).toBeUndefined()
    expect(seen).toEqual(["file:selected", "file:selected"])
  })
  it("refuses an unavailable input in a disconnected receipt", () => {
    const f = fixture(); f.current.delete("file:disconnected")
    expect(attach(f)).toBe("evaluation-attachment: ownership-input-unavailable")
  })
  it("refuses evaluation.assert before binding or input reads", () => {
    const f = fixture(), current = vi.fn()
    expect(attach(f, current, () => { throw new Error("admit denied") })).toBe("evaluation-policy-denied")
    expect(gates.binding).not.toHaveBeenCalled(); expect(current).not.toHaveBeenCalled()
  })
  it("refuses evaluation carrier on operational path without reading CAS", () => {
    const get = vi.fn(), node = { kind: "advisory", claimNorm: "Evaluation-only ownership manifest for synthetic" }
    expect(ownershipAttachmentRefusal(node as Parameters<typeof ownershipAttachmentRefusal>[0], { get } as unknown as Parameters<typeof ownershipAttachmentRefusal>[1], undefined)).toBe("evaluation-operational-attachment-refused")
    expect(get).not.toHaveBeenCalled()
  })
  it("leaves operational nodes without ownership alone", () => {
    const get = vi.fn(), node = { kind: "advisory", claimNorm: "ordinary" }
    expect(ownershipAttachmentRefusal(node as Parameters<typeof ownershipAttachmentRefusal>[0], { get } as unknown as Parameters<typeof ownershipAttachmentRefusal>[1], undefined)).toBeUndefined()
    expect(get).not.toHaveBeenCalled()
  })
})
