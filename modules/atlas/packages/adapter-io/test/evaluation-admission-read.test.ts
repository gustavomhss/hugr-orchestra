import { describe, expect, it } from "vitest"
import { createStore, id } from "@atlas/kernel"
import { OWNERSHIP_ADMISSION_CRITERIA, readOwnership } from "@atlas/knowledge"
import type { EvaluationOwnershipArtifact, EvaluationOwnershipContract, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, EvaluationOwnershipReview, OwnershipEvaluationContext } from "@atlas/knowledge"
import { assertAdmissionCoverage, readEvaluationAdmission } from "../src/evaluation-admission-read.js"

// All votes, bodies and inputs below are synthetic. No campaign material or filesystem operations.
function fixture(bad: "none" | "body" | "review" | "dependency" | "phase" = "none") {
  const store = createStore(), keys = ["selected", "disconnected"], current = new Map(keys.map((key) => [`file:${key}`, "v1"]))
  const evaluation = { phase: "evaluation" as const, evaluationPlan: id({ synthetic: "plan" }), obligationSet: id({ synthetic: "obligations" }) }
  const context: OwnershipEvaluationContext = { evaluation, evaluationCandidate: id({ synthetic: "candidate" }), generation: id({ synthetic: "generation" }) }
  const contract: EvaluationOwnershipContract = { kind: "ownership-contract", version: 2, evaluation, criteria: [...OWNERSHIP_ADMISSION_CRITERIA] }
  const contractRef = store.put(contract)
  const entries = keys.map((key) => {
    const broken = key === "disconnected"
    const body = store.put({ kind: "ownership-body", version: 1, bytes: broken && bad === "body" ? [255] : [...new TextEncoder().encode(key)] })
    const result = store.put({ kind: "ownership-result", version: 1, body, authority: { scope: "test.scope", basis: "synthetic" }, validity: "supported", gaps: [], evidence: ["synthetic"] })
    const inputs = [{ key: `file:${key}`, version: "v1" }]
    const dependencies = broken && bad === "dependency" ? [{ key: "missing", result }] : []
    const reviews = ["test-a", "test-b"].map((reviewer) => {
      const review: EvaluationOwnershipReview = { kind: "ownership-review", version: 2, evaluation, evaluationCandidate: context.evaluationCandidate, reviewer,
        contract: contractRef, inputs: id({ inputs, dependencies }), result,
        criteria: broken && bad === "review" ? [] : [...OWNERSHIP_ADMISSION_CRITERIA], verdict: "pass", provenance: "synthetic only" }
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
function single(f: ReturnType<typeof fixture>, current = (key: string) => f.current.get(key)) {
  return readEvaluationAdmission(f.store, f.manifest, "test.scope", f.keys, current, f.context)
}
function oldLoop(f: ReturnType<typeof fixture>, current = (key: string) => f.current.get(key)) {
  return f.keys.map((key) => readOwnership(f.store, f.manifest, { scope: "test.scope", key, maxBytes: Number.MAX_SAFE_INTEGER }, current, f.context))
}

describe("evaluation admission single integral traversal, synthetic", () => {
  it("matches stable full-loop acceptance and visits disconnected entries", () => {
    const f = fixture(), r = single(f)
    expect(r.kind).toBe("ready")
    if (r.kind === "hold") throw new Error("fixture refused")
    expect(new Set(r.checked)).toEqual(new Set(f.keys))
    expect(oldLoop(f).map((x) => x.kind)).toEqual(["ready", "ready"])
  })
  it("observes two inputs once, not four from two integral traversals", () => {
    const f = fixture(); let count = 0
    const current = (key: string) => { count++; return f.current.get(key) }
    expect(single(f, current).kind).toBe("ready"); expect(count).toBe(2)
    count = 0; oldLoop(f, current); expect(count).toBe(4)
  })
  for (const bad of ["body", "review", "dependency", "phase"] as const) {
    it(`refuses disconnected ${bad} corruption just as original`, () => {
      const f = fixture(bad), r = single(f)
      expect(r.kind).toBe("hold")
      for (const previous of oldLoop(f)) expect(previous).toEqual(r)
    })
  }
  it("refuses changed input on disconnected entry", () => {
    const f = fixture(); f.current.set("file:disconnected", "v2")
    expect(single(f).kind).toBe("hold"); expect(oldLoop(f)[0]).toEqual(single(f))
  })
  it("refuses unavailable input rather than treating it as no inputs", () => {
    const f = fixture(); f.current.delete("file:disconnected")
    expect(single(f).kind).toBe("hold"); expect(oldLoop(f)[0]).toEqual(single(f))
  })
  it("does not cache observations between admission calls", () => {
    const f = fixture(); expect(single(f).kind).toBe("ready")
    f.current.set("file:selected", "v2"); expect(single(f).kind).toBe("hold")
  })
  it("detects a mutation before a later entry is observed in the same traversal", () => {
    const f = fixture()
    expect(single(f, (key) => { if (key === "file:selected") f.current.set("file:disconnected", "v2"); return f.current.get(key) }).kind).toBe("hold")
  })
  it("documents temporal non-equivalence: not an atomic snapshot or repeated sampling", () => {
    const a = fixture(); let n = 0
    expect(single(a, (key) => ++n > 2 ? "v2" : a.current.get(key)).kind).toBe("ready")
    const b = fixture(); n = 0
    expect(oldLoop(b, (key) => ++n > 2 ? "v2" : b.current.get(key)).map((x) => x.kind)).toEqual(["ready", "hold"])
  })
  it("fails exact coverage on omission, extra, duplicate, empty or wrong same-length set", () => {
    for (const [wanted, checked] of [ [["a", "b"], ["a"]], [["a"], ["a", "b"]], [["a"], ["a", "a"]], [["a", "a"], ["a"]], [[], []], [["a", "b"], ["a", "c"]] ])
      expect(() => assertAdmissionCoverage(wanted!, checked!)).toThrow("evaluation-admission-coverage")
    expect(() => assertAdmissionCoverage(["a", "b"], ["b", "a"])).not.toThrow()
  })
  it("rejects manifest containing extra entries even when selected entry is valid", () => {
    const f = fixture()
    expect(() => readEvaluationAdmission(f.store, f.manifest, "test.scope", [f.keys[0]!], (key) => f.current.get(key), f.context)).toThrow("evaluation-admission-coverage")
  })
  it("rejects empty requested set before invoking observer", () => {
    const f = fixture(); let calls = 0
    expect(() => readEvaluationAdmission(f.store, f.manifest, "test.scope", [], () => { calls++; return "v1" }, f.context)).toThrow("evaluation-admission-coverage")
    expect(calls).toBe(0)
  })
})
