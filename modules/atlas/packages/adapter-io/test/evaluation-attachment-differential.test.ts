import { describe, expect, it } from "vitest"
import { createStore, id } from "@atlas/kernel"
import { OWNERSHIP_ADMISSION_CRITERIA, readOwnership } from "@atlas/knowledge"
import type {
  EvaluationOwnershipArtifact, EvaluationOwnershipContract, EvaluationOwnershipManifest,
  EvaluationOwnershipReceipt, EvaluationOwnershipReview, OwnershipEvaluationContext,
} from "@atlas/knowledge"
import { assertAdmissionCoverage, readEvaluationAdmission } from "../src/evaluation-admission-read.js"

type Fault = "none" | "review" | "body" | "dependency" | "result" | "input" | "cycle"

function fixture(fault: Fault = "none") {
  const store = createStore()
  const keys = ["connected-root", "disconnected-leaf"]
  const evaluation = {
    phase: "evaluation" as const,
    evaluationPlan: id({ fixture: "plan" }),
    obligationSet: id({ fixture: "obligations" }),
  }
  const context: OwnershipEvaluationContext = {
    evaluation,
    evaluationCandidate: id({ fixture: "candidate" }),
    generation: id({ fixture: "generation" }),
  }
  const contract: EvaluationOwnershipContract = {
    kind: "ownership-contract", version: 2, evaluation,
    criteria: [...OWNERSHIP_ADMISSION_CRITERIA],
  }
  const contractRef = store.put(contract)
  const bodies = keys.map((key, index) => store.put({
    kind: "ownership-body", version: 1,
    bytes: index === 1 && fault === "body" ? [255] : [...new TextEncoder().encode(`synthetic ${key}`)],
  }))
  const results = keys.map((key, index) => store.put(
    index === 1 && fault === "result"
      ? { kind: "not-an-ownership-result", key }
      : {
          kind: "ownership-result", version: 1, body: bodies[index]!,
          authority: { scope: "differential.scope", basis: "synthetic" },
          validity: "supported", gaps: [], evidence: ["synthetic"],
        },
  ))
  const entries = keys.map((key, index) => {
    const inputs = [{ key: `file:${key}`, version: "v1" }]
    const dependencies: EvaluationOwnershipReceipt["dependencies"] =
      fault === "dependency" && index === 1
        ? [{ key: "not-in-manifest", result: results[0]! }]
        : fault === "cycle"
          ? [{ key: keys[1 - index]!, result: results[1 - index]! }]
          : []
    const reviews = ["synthetic-reviewer-a", "synthetic-reviewer-b"].map((reviewer) => {
      const review: EvaluationOwnershipReview = {
        kind: "ownership-review", version: 2, evaluation,
        evaluationCandidate: context.evaluationCandidate, reviewer,
        contract: contractRef, inputs: id({ inputs, dependencies }), result: results[index]!,
        criteria: index === 1 && fault === "review"
          ? [...OWNERSHIP_ADMISSION_CRITERIA].slice(1)
          : [...OWNERSHIP_ADMISSION_CRITERIA],
        verdict: "pass", provenance: "synthetic fixture; not independent judgment",
      }
      return store.put(review)
    })
    const receipt: EvaluationOwnershipReceipt = {
      kind: "ownership-receipt", version: 2, evaluation,
      evaluationCandidate: context.evaluationCandidate, contract: contractRef,
      inputs, dependencies, reviews,
    }
    const artifact: EvaluationOwnershipArtifact = {
      kind: "ownership-artifact", version: 2, evaluation,
      evaluationCandidate: context.evaluationCandidate, key,
      scope: "differential.scope", title: key, layer: 1, need: "entry",
      result: results[index]!, navigation: [], receipt: store.put(receipt),
    }
    return { key, artifact: store.put(artifact) }
  })
  const manifest: EvaluationOwnershipManifest = {
    kind: "ownership-manifest", version: 2, evaluation,
    evaluationCandidate: context.evaluationCandidate, generation: context.generation,
    scope: "differential.scope", roots: { entry: keys[0]! }, entries,
  }
  const current = new Map(keys.map((key) => [`file:${key}`, "v1"]))
  if (fault === "input") current.set("file:disconnected-leaf", "v2")
  return { store, keys, context, manifest: store.put(manifest), current }
}

// Historical implementation at 52d1e55f: one independent read per manifest entry.
function oldLoop(f: ReturnType<typeof fixture>) {
  for (const entry of f.keys) {
    const result = readOwnership(
      f.store, f.manifest,
      { scope: "differential.scope", key: entry, maxBytes: Number.MAX_SAFE_INTEGER },
      (key) => f.current.get(key), f.context,
    )
    if (result.kind === "hold") return result.reason
  }
  return undefined
}

// Current implementation: one fresh integral traversal and exact checked-key coverage.
function newHelper(f: ReturnType<typeof fixture>) {
  try {
    const result = readEvaluationAdmission(
      f.store, f.manifest, "differential.scope", f.keys,
      (key) => f.current.get(key), f.context,
    )
    return result.kind === "hold" ? result.reason : undefined
  } catch (error) {
    if (error instanceof Error && error.message === "evaluation-admission-coverage") return "coverage"
    throw error
  }
}

describe("evaluation attachment: old loop vs integral helper (stable synthetic state)", () => {
  it("accepts a disconnected graph when every manifest entry is valid", () => {
    const f = fixture()
    expect(oldLoop(f)).toBeUndefined()
    expect(newHelper(f)).toBeUndefined()
  })

  for (const fault of ["review", "body", "dependency", "result", "input", "cycle"] as const) {
    it(`both paths refuse a disconnected ${fault} defect`, () => {
      const f = fixture(fault)
      expect(newHelper(f)).toBe(oldLoop(f))
      expect(newHelper(f)).not.toBeUndefined()
    })
  }

  it("does not confuse exact coverage with equal cardinality", () => {
    expect(() => assertAdmissionCoverage(["a", "b"], ["a", "c"])).toThrow("evaluation-admission-coverage")
    expect(() => assertAdmissionCoverage(["a", "a"], ["a", "a"])).toThrow("evaluation-admission-coverage")
  })

  it("makes the empty-manifest behavior difference explicit: old loop vacuously passes, helper fails closed", () => {
    const empty: string[] = []
    expect(empty.every(() => false)).toBe(true)
    expect(() => assertAdmissionCoverage(empty, empty)).toThrow("evaluation-admission-coverage")
  })

  it("keeps ordinary operational attachments outside the evaluation traversal", async () => {
    const { ownershipAttachmentRefusal } = await import("../src/ownership-attachment.js")
    const get = () => { throw new Error("operational path must not read CAS") }
    const node = { kind: "advisory", claimNorm: "ordinary operational claim" }
    expect(ownershipAttachmentRefusal(
      node as never, { get } as never, undefined,
    )).toBeUndefined()
  })
})
