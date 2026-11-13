import { beforeEach, describe, expect, it, vi } from "vitest"
import { createStore, id } from "@atlas/kernel"
import { OWNERSHIP_ADMISSION_CRITERIA } from "@atlas/knowledge"
import type { EvaluationOwnershipArtifact, EvaluationOwnershipContract, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, EvaluationOwnershipReview, OwnershipEvaluationContext } from "@atlas/knowledge"
import { ownershipAttachmentRefusal } from "../src/ownership-attachment.js"
const gates = vi.hoisted(() => ({ policy: vi.fn(), binding: vi.fn(), mode: "coverage" as "coverage" | "unexpected" }))
vi.mock("../src/ownership-evaluation-policy.js", () => ({ assertEvaluationComposition: gates.policy }))
vi.mock("../src/evaluation-manifest-binding.js", () => ({ evaluationManifestRefusal: gates.binding }))
vi.mock("../src/ownership-access.js", () => ({ evaluationOwnershipClaim: () => "synthetic-evaluation", ownershipClaim: () => "synthetic-operational" }))

vi.mock("../src/evaluation-admission-read.js", async importOriginal => {
  const real = await importOriginal<typeof import("../src/evaluation-admission-read.js")>()
  return { ...real, readEvaluationAdmission: (...args: Parameters<typeof real.readEvaluationAdmission>) => {
    if (gates.mode === "unexpected") throw new Error("unexpected helper failure")
    // Deliberate boundary fault injection: real coverage assertion with missing checked entries.
    // Not a claim that stable, valid CAS naturally produces inconsistent coverage.
    real.assertAdmissionCoverage(args[3], [])
    throw new Error("coverage test did not reject")
  } }
})
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

beforeEach(() => { gates.policy.mockReset(); gates.binding.mockReset(); gates.mode = "coverage" })
describe("attachment exception contract with explicit helper fault injection", () => {
  it("normalizes the real coverage assertion rejection to refusal", () => {
    expect(attach(fixture())).toBe("evaluation-attachment-coverage")
  })
  it("does not mask an unexpected helper exception", () => {
    gates.mode = "unexpected"
    expect(() => attach(fixture())).toThrow("unexpected helper failure")
  })
})
