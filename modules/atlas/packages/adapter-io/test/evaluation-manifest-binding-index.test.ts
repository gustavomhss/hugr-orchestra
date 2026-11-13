import { describe, expect, it } from "vitest"
import { createStore, id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { EvaluationOwnershipArtifact, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, OwnershipEvaluationContext } from "@atlas/knowledge"
import { evaluationManifestRefusal } from "../src/evaluation-manifest-binding.js"
import { evaluationRuntimeIdentity } from "../src/evaluation-runtime-identity.js"

function fixture(options: { duplicate?: boolean; missing?: boolean; changed?: boolean } = {}) {
  const store = createStore()
  const evaluation = {
    phase: "evaluation" as const,
    evaluationPlan: store.put({ plan: "synthetic" }),
    obligationSet: store.put({ obligations: "synthetic" }),
  }
  const generation = store.put({ generation: "synthetic" })
  const scope = "synthetic.scope"
  const key = "entry"
  const contract = store.put({ contract: "synthetic" })
  const inputs = [{ key: "file:source", version: options.changed ? "v2" : "v1" }]
  const dependencies: { key: string; result: Hash }[] = []
  const result = store.put({ kind: "ownership-result", version: 1, body: store.put({ body: "synthetic" }),
    authority: { scope, basis: "synthetic" }, validity: "supported", gaps: [], evidence: ["synthetic"] })
  const receiptFor = (receiptContract: Hash): Hash => store.put({
    kind: "ownership-receipt", version: 2, evaluation, evaluationCandidate: candidateId,
    contract: receiptContract, inputs, dependencies, reviews: [store.put({ review: "synthetic-a" }), store.put({ review: "synthetic-b" })],
  } satisfies EvaluationOwnershipReceipt)
  const candidateEntries = [{
    key, contract, inputs, dependencies,
    artifact: { key, scope, title: "first", layer: 1 as const, need: "entry" as const, result, navigation: [] as string[] },
  }]
  if (options.duplicate) candidateEntries.push({
    key, contract, inputs, dependencies,
    artifact: { key, scope, title: "second", layer: 1 as const, need: "entry" as const, result, navigation: [] as string[] },
  })
  if (options.missing) candidateEntries.splice(0, candidateEntries.length)
  const candidate = {
    kind: "genesis-evaluation-candidate", version: 2, phase: "evaluation",
    scope, repo_root: "/synthetic", evaluation, runtime_identity: evaluationRuntimeIdentity(),
    roots: { entry: key }, entries: candidateEntries, observations: [{ key: "file:source", version: options.changed ? "v2" : "v1" }],
  }
  const candidateId = store.put(candidate)
  // The first duplicate is the legacy Array.find winner.
  const selected = candidateEntries[0]
  if (!selected) throw new Error("fixture requires an entry")
  const receipt = receiptFor(contract)
  const artifact: EvaluationOwnershipArtifact = {
    kind: "ownership-artifact", version: 2, evaluation, evaluationCandidate: candidateId,
    key, scope, title: options.changed ? "changed" : selected.artifact.title, layer: 1, need: "entry",
    result, receipt, navigation: [],
  }
  const artifactId = store.put(artifact)
  const manifest: EvaluationOwnershipManifest = {
    kind: "ownership-manifest", version: 2, evaluation, evaluationCandidate: candidateId, generation,
    scope, roots: { entry: key }, entries: options.duplicate ? [{ key, artifact: artifactId }, { key: "other", artifact: artifactId }] : [{ key, artifact: artifactId }],
  }
  const manifestId = store.put(manifest)
  const context: OwnershipEvaluationContext = { evaluation, evaluationCandidate: candidateId, generation }
  return { store, manifestId, context, candidateId, candidate }
}

describe("evaluation manifest candidate entry index", () => {
  it("preserves first-occurrence semantics for duplicate candidate keys", () => {
    const f = fixture({ duplicate: true })
    expect(evaluationManifestRefusal(f.store, f.manifestId, {
      scope: "synthetic.scope", root: "/synthetic", context: f.context,
    } as never, () => "v1")).toBeUndefined()
  })

  it("refuses a missing candidate entry", () => {
    const f = fixture()
    const candidate = { ...f.candidate, entries: [{ ...f.candidate.entries[0]!, key: "other" }] }
    const candidateId = f.store.put(candidate)
    const manifest = f.store.get(f.manifestId) as EvaluationOwnershipManifest
    const rebound = f.store.put({ ...manifest, evaluationCandidate: candidateId })
    expect(evaluationManifestRefusal(f.store, rebound, {
      scope: "synthetic.scope", root: "/synthetic", context: { ...f.context, evaluationCandidate: candidateId },
    } as never, () => "v1")).toBe("evaluation-entry-missing")
  })

  it("rebuilds the index from changed records on each call", () => {
    const first = fixture()
    let currentReads = 0
    const current = () => { currentReads++; return "v1" }
    expect(evaluationManifestRefusal(first.store, first.manifestId, {
      scope: "synthetic.scope", root: "/synthetic", context: first.context,
    } as never, current)).toBeUndefined()
    expect(evaluationManifestRefusal(first.store, first.manifestId, {
      scope: "synthetic.scope", root: "/synthetic", context: first.context,
    } as never, current)).toBeUndefined()
    expect(currentReads).toBe(2)
    const second = fixture({ changed: true })
    expect(evaluationManifestRefusal(second.store, second.manifestId, {
      scope: "synthetic.scope", root: "/synthetic", context: second.context,
    } as never, () => "v2")).toBe("evaluation-entry-drift")
  })
})
