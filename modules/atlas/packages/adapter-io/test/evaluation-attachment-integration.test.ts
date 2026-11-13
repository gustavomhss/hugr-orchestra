import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { asNodeKey, id } from "@atlas/kernel"
import { createCheck } from "@atlas/tools"
import { OWNERSHIP_ADMISSION_CRITERIA } from "@atlas/knowledge"
import type { GroundedFact, EvaluationOwnershipArtifact, EvaluationOwnershipManifest, EvaluationOwnershipReceipt, EvaluationOwnershipReview } from "@atlas/knowledge"
import { makeFixRepo } from "./harness/fix-repo.js"
import { createDiskStore } from "../src/store.js"
import { ownershipInput } from "../src/ownership-input.js"
import { evaluationRuntimeIdentity } from "../src/evaluation-runtime-identity.js"
import { initializeEvaluationStore, loadEvaluationAccess } from "../src/ownership-evaluation-policy.js"
import { evaluationOwnershipClaim } from "../src/ownership-access.js"
import { loadPolicy } from "../src/policy.js"
import { buildCheckPort } from "../src/check-source.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { deriveGroundingAxes, buildGate } from "../src/grounding-computer.js"
import { walkFileTree } from "../src/fs.js"
import { readScipOrEmpty } from "../src/scip.js"

// Synthetic integration fixture only: no campaign data, release votes, or fabricated digest strings.
// No vi.mock: attachment, binding, policy capability, disk store, truth gate and observer are REAL.
// The counted observer is a transparent wrapper around the real filesystem observer.
// This exercises the real check/emit legs, not the CLI/wire transport or prepare/admit import pipeline.
const cleanups: (() => void)[] = []
const priorActor = process.env.ATLAS_ACTOR
const priorToken = process.env.ATLAS_RATIFY_TOKEN
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorToken === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorToken
})

function fixture(count: 2 | 4) {
  process.env.ATLAS_ACTOR = "synthetic-attachment-operator"
  // Ordinary synthetic ratifier label, not a secret or campaign approval. Real ratify gate stays enabled.
  process.env.ATLAS_RATIFY_TOKEN = "explicit-synthetic-fixture-token"
  const repo = makeFixRepo()
  cleanups.push(repo.cleanup)
  const root = repo.repoPath, scope = "core", actor = process.env.ATLAS_ACTOR
  mkdirSync(join(root, ".atlas/cas"), { recursive: true })
  const store = createDiskStore(join(root, ".atlas/cas"))
  const paths = ["src/util.ts", "src/app.ts", "api/service.py", "legacy/report.rb"].slice(0, count)
  const keys = paths.map((_, i) => i === 0 ? "selected" : `disconnected-${i}`)
  const observations = paths.map(path => {
    const key = `file:${path}`, version = ownershipInput(root, key)
    if (version === undefined) throw new Error(`synthetic fixture input unavailable: ${key}`)
    return { key, version }
  })
  const evaluationPlan = store.put({ schema: "genesis-evaluation-plan/v1",
    isolation: { root, original_root: `${root}-synthetic-origin` }, consumer_ids: [],
    consumer_modes: {}, read_limits: {}, maintenance: { mode: "synthetic-test-only" } })
  const evaluation = { phase: "evaluation" as const, evaluationPlan,
    obligationSet: store.put({ synthetic: "attachment integration obligations, not release evidence" }) }
  const contract = store.put({ kind: "ownership-contract", version: 2, evaluation,
    criteria: [...OWNERSHIP_ADMISSION_CRITERIA] })
  const entries = keys.map((key, i) => {
    const body = store.put({ kind: "ownership-body", version: 1,
      bytes: [...new TextEncoder().encode(`Synthetic attachment body: ${key}\n`)] })
    const result = store.put({ kind: "ownership-result", version: 1, body,
      authority: { scope, basis: "Synthetic test only" }, validity: "supported", gaps: [], evidence: ["synthetic"] })
    const inputs = [observations[i]!], dependencies: EvaluationOwnershipReceipt["dependencies"] = []
    return { key, contract, inputs, dependencies, inputs_id: id({ inputs, dependencies }),
      artifact: { kind: "ownership-artifact" as const, version: 1 as const, key, scope, title: key,
        layer: 1 as const, need: "entry" as const, result, navigation: [] },
      semanticEvidence: [] }
  })
  // Minimal candidate fields required by the real host binding. This does NOT assert that a
  // package import/prepare/semantic admission pipeline accepted this synthetic CAS graph.
  const candidate = { kind: "genesis-evaluation-candidate", version: 2, phase: "evaluation",
    repo_root: root, scope, evaluation, runtime_identity: evaluationRuntimeIdentity(),
    observations, entries, roots: { entry: keys[0]! }, required_artifact_keys: keys }
  const evaluationCandidate = store.put(candidate), generation = id({ synthetic: "attachment-generation", evaluationCandidate })
  const context = { evaluation, evaluationCandidate, generation }
  const manifestEntries = entries.map(entry => {
    const reviews = ["synthetic-a", "synthetic-b"].map(reviewer => {
      const review: EvaluationOwnershipReview = { kind: "ownership-review", version: 2, evaluation,
        evaluationCandidate, reviewer, contract, inputs: entry.inputs_id, result: entry.artifact.result,
        criteria: [...OWNERSHIP_ADMISSION_CRITERIA], verdict: "pass", provenance: "Synthetic fixture only, not independent judgment" }
      return store.put(review)
    })
    const receipt: EvaluationOwnershipReceipt = { kind: "ownership-receipt", version: 2, evaluation,
      evaluationCandidate, contract, inputs: entry.inputs, dependencies: entry.dependencies, reviews }
    const artifact: EvaluationOwnershipArtifact = { ...entry.artifact, version: 2, evaluation,
      evaluationCandidate, receipt: store.put(receipt) }
    return { key: entry.key, artifact: store.put(artifact) }
  })
  const manifest: EvaluationOwnershipManifest = { kind: "ownership-manifest", version: 2,
    ...context, scope, entries: manifestEntries, roots: candidate.roots }
  const ownership = store.put(manifest)
  initializeEvaluationStore(root, evaluationCandidate, generation)
  writeFileSync(join(root, ".atlas/policy.json"), JSON.stringify({
    t0Heuristic: { keywords: [] }, authz: { scopes: { [scope]: [actor] } } }))
  writeFileSync(join(root, ".atlas/evaluation-policy.json"), JSON.stringify({
    schema: "ownership-evaluation-policy/v1", root, evaluationPlan,
    obligationSet: evaluation.obligationSet, evaluationCandidate, generation, scope,
    actor, operations: ["admit"], consumer: null }))
  const access = loadEvaluationAccess(root)
  const axes = () => deriveGroundingAxes(walkFileTree(root), readScipOrEmpty(join(root, ".atlas/index.scip"))).axes
  const initialAxes = axes()
  // File anchor unaffected by mutations to a DISCONNECTED input; prevents the truth gate
  // short-circuiting before the attachment/binding gate we intend to exercise.
  const anchor = initialAxes.spatial.children.flatMap(dir => dir.children).find(node => node.key === paths[0])
  if (anchor === undefined) throw new Error("synthetic anchor missing")
  const node: GroundedFact = { kind: "advisory", id: asNodeKey(String(id({ ownership }))), tier: "T2", scope,
    claimNorm: evaluationOwnershipClaim(scope, evaluationCandidate), predicateSlot: "ownership", ownership,
    grounding: { entries: [{ anchor: { kind: "file", qualifiedPath: anchor.key, subtreeHash: anchor.subtreeHash }, path: paths[0]! }] },
    freshness: "FRESH", claims: [], authoring: "ADVISORY" }
  const seen: string[] = []
  const current = (key: string) => { seen.push(key); return ownershipInput(root, key) }
  const deps = () => ({ store, gate: buildGate(axes()), policy: loadPolicy(root), actor,
    evaluation: access, ownershipInput: current, ratifyToken: process.env.ATLAS_RATIFY_TOKEN! })
  const check = () => createCheck(buildCheckPort(deps())).check(node, id({ synthetic: "check-at" }))
  const emit = () => createGovernedEmit(deps()).emit(node, id({ synthetic: "emit-at" }))
  const active = () => [...(store.loadProjection()?.current.entries() ?? [])]
  return { root, store, paths, observations, node, seen, check, emit, active }
}

describe("real attachment check and emit integration, synthetic only", () => {
  for (const count of [2, 4] as const) {
    it(`performs one integral traversal at each successful gate with ${count} disconnected entries`, () => {
      const f = fixture(count), expectedKeys = f.observations.map(x => x.key)
      expect(f.active()).toEqual([])
      expect(f.check()).toMatchObject({ wouldEmit: true })
      // N binding observations + N receipt observations; NOT N integral traversals.
      expect(f.seen).toEqual([...expectedKeys, ...expectedKeys])
      expect(f.active()).toEqual([])
      f.seen.length = 0
      expect(f.emit().emitted).toBe(true)
      expect(f.seen).toEqual([...expectedKeys, ...expectedKeys])
      expect(f.active()).toHaveLength(1)
    })
  }

  it("re-reads on emit after a real disconnected-file change and commits no active fact", () => {
    const f = fixture(2)
    expect(f.check()).toMatchObject({ wouldEmit: true })
    expect(f.seen).toHaveLength(4)
    const before = f.active()
    f.seen.length = 0
    writeFileSync(join(f.root, f.paths[1]!), "Synthetic changed disconnected source\n")
    // The selected file's real truth anchor stays valid. Real binding sees fresh bytes
    // and refuses before integral traversal. This is expected defense ordering, not a mock.
    expect(f.emit()).toMatchObject({ emitted: false, rejected: "evaluation-input-drift" })
    expect(f.seen).toEqual(f.observations.map(x => x.key))
    expect(f.active()).toEqual(before)
    expect(f.active()).toEqual([])
  })
})

