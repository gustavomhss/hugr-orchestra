import { describe, expect, it, vi } from "vitest"
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


import { prepareMaintenanceHost, finalizeMaintenanceHost, admitMaintenanceHost } from "../src/evaluation-maintenance-host.js"
import type { MaintenanceHostEnvelope } from "../src/evaluation-maintenance-host.js"
function envelope(f: ReturnType<typeof fixture>): MaintenanceHostEnvelope {
 f.request = {...f.request, targetRepoRoot: "/synthetic-target"}
 return {stage:"prepare",candidate:f.request.baseline.candidate_id,targetRoot:"/synthetic-target",targetGeneration:f.request.targetGeneration,maxEntries:16,maxRecipeCalls:16,maxCapturedBytes:1048576,maxOutputBytes:1048576,releaseReference:"synthetic-only-no-authority"}
}
describe("finite maintenance host synthetic controls",()=> {
 it("unchanged inputs at new root prepare a target with preserved results and zero recipe calls",()=>{const f=fixture(),e=envelope(f);const r=prepareMaintenanceHost(e,f.request);expect(r.result.kind).toBe("prepared-evaluation-update");expect(r.accounting.recipeCalls).toEqual([]);if(r.result.kind!=="prepared-evaluation-update")throw Error("fixture");expect(r.result.prepared.candidate.repo_root).toBe("/synthetic-target");expect(r.result.targetGeneration).toBe(e.targetGeneration);expect(r.result.prepared.candidate.entries.map(x=>x.artifact.result)).toEqual(f.request.baseline.candidate.entries.map(x=>x.artifact.result))})
 it("changed candidate stays private and new binding finalizes",()=>{const f=fixture(),e=envelope(f);f.source.body="new body";f.current.set("file:source","s2");const r=prepareMaintenanceHost(e,f.request);expect(r.result.kind).toBe("prepared-evaluation-update");if(r.result.kind!=="prepared-evaluation-update")throw Error("fixture");expect(r.accounting.recipeCalls).toEqual(["entry"]);const ev=decisions(r.result);expect(finalizeMaintenanceHost({...e,stage:"finalize",candidate:r.result.prepared.candidate_id},{store:f.store,target:r.result,...ev,current:k=>f.current.get(k)}).kind).toBe("private-evaluation-candidate")})
 it("wrong stage fails before store work",()=>{const f=fixture(),e=envelope(f);expect(()=>prepareMaintenanceHost({...e,stage:"finalize"},f.request)).toThrow("envelope")})
 it("same baseline root refused",()=>{const f=fixture(),e=envelope(f);expect(()=>prepareMaintenanceHost({...e,targetRoot:"/synthetic"},{...f.request,targetRepoRoot:"/synthetic"})).toThrow("isolation")})
 it("zero or unbounded cap refused",()=>{const f=fixture(),e=envelope(f);expect(()=>prepareMaintenanceHost({...e,maxCapturedBytes:0},f.request)).toThrow("cap");expect(()=>prepareMaintenanceHost({...e,maxEntries:257},f.request)).toThrow("cap")})
 it("capture overflow yields HOLD",()=>{const f=fixture(),e=envelope(f);expect(prepareMaintenanceHost({...e,maxCapturedBytes:1},f.request).result.kind).toBe("hold")})
 it("output overflow yields HOLD and recorded attempted recipe",()=>{const f=fixture(),e=envelope(f);f.source.body="new body";f.current.set("file:source","s2");const r=prepareMaintenanceHost({...e,maxOutputBytes:1},f.request);expect(r.result.kind).toBe("hold");expect(r.accounting.recipeCalls).toEqual(["entry"])})
 it("missing semantic evidence is not fabricated",()=>{const f=fixture(),e=envelope(f);f.current.set("file:source","s2");f.source.body="new body";expect(prepareMaintenanceHost(e,{...f.request,semanticEvidence:()=>undefined}).result.kind).toBe("hold")})
 it("registry coverage remains native gate",()=>{const f=fixture(),e=envelope(f);expect(prepareMaintenanceHost(e,{...f.request,recipes:new Map()}).result.kind).toBe("hold")})
})

// Spy only the actual native admission boundary; no initialization/policy/publication in these fixtures.
vi.mock("../src/genesis-evaluation.js", async (importOriginal) => {
 const actual = await importOriginal<typeof import("../src/genesis-evaluation.js")>()
 return {...actual, admitEvaluationRebuildTarget: vi.fn()}
})
import { admitEvaluationRebuildTarget } from "../src/genesis-evaluation.js"
function admissionFixture() {
 const plan = {schema:"genesis-evaluation-rebuild-plan/v1",target_generation:id({generation:"target"})}
 const candidate = {entries:[],repo_root:"/synthetic-target",evaluation:{evaluationPlan:id(plan)}}
 const prepared = {candidate_id:id(candidate),candidate}
 const e: MaintenanceHostEnvelope = {stage:"admit-target",candidate:prepared.candidate_id,targetRoot:candidate.repo_root,targetGeneration:plan.target_generation,maxEntries:16,maxRecipeCalls:16,maxCapturedBytes:1024,maxOutputBytes:1024,releaseReference:"synthetic-admission-only"}
 return {plan,prepared,e}
}
describe("admit host wrapper boundary synthetic only",()=> {
 const port=vi.mocked(admitEvaluationRebuildTarget)
 it.each(["stage","candidate","root","plan-hash","generation"])("rejects %s before native delegation",async fault=>{
  port.mockReset();const f=admissionFixture();let {e,prepared,plan}=f
  if(fault==="stage")e={...e,stage:"prepare"}
  if(fault==="candidate")e={...e,candidate:"0".repeat(64)}
  if(fault==="root")e={...e,targetRoot:"/other-target"}
  if(fault==="plan-hash"){plan={...plan,target_generation:id({generation:"different-plan"})};e={...e,targetGeneration:plan.target_generation}}
  if(fault==="generation")e={...e,targetGeneration:"0".repeat(64)}
  await expect(admitMaintenanceHost(e,prepared,"approval.json",plan)).rejects.toThrow(/maintenance-host-/)
  expect(port).not.toHaveBeenCalled()
 })
 it("rejects candidate content corruption with unchanged matching envelope and recorded id",async()=>{
  port.mockReset();const f=admissionFixture()
  const corrupted={...f.prepared,candidate:{...f.prepared.candidate,entries:[{synthetic:"corrupted-content"}]}}
  expect(f.e.candidate).toBe(corrupted.candidate_id)
  expect(corrupted.candidate.entries.length).toBeLessThanOrEqual(f.e.maxEntries)
  await expect(admitMaintenanceHost(f.e,corrupted,"approval.json",f.plan)).rejects.toThrow("maintenance-host-target")
  expect(port).not.toHaveBeenCalled()
 })
 it("forwards exactly once without changing native arguments or result",async()=>{
  port.mockReset();const f=admissionFixture();const result={kind:"hold",reason:"synthetic-native-hold"};port.mockResolvedValueOnce(result as never)
  expect(await admitMaintenanceHost(f.e,f.prepared,"approval.json",f.plan)).toBe(result)
  expect(port).toHaveBeenCalledTimes(1);expect(port).toHaveBeenCalledWith(f.e.targetRoot,f.prepared,"approval.json")
 })
 it("preserves native failure without retry",async()=>{
  port.mockReset();const f=admissionFixture();const error=new Error("synthetic-native-refusal");port.mockRejectedValueOnce(error)
  await expect(admitMaintenanceHost(f.e,f.prepared,"approval.json",f.plan)).rejects.toBe(error);expect(port).toHaveBeenCalledTimes(1)
 })
})
