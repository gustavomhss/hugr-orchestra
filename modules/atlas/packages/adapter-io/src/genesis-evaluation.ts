import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { evaluationRuntimeIdentity } from "./evaluation-runtime-identity.js"
import { posix } from "node:path"
import { asNodeKey, id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { OWNERSHIP_ADMISSION_CRITERIA, readOwnership, isEvaluationOwnershipManifest } from "@atlas/knowledge"
import type { GroundedFact, EvaluationOwnershipContract, EvaluationOwnershipManifest, EvaluationOwnershipReview, EvaluationOwnershipReceipt } from "@atlas/knowledge"
import { prepareNativePackage } from "./genesis-native.js"
import type { NativeCandidate, PreparedNativePackage } from "./genesis-native.js"
import { nativeKeys, nativeRecord, nativeText, nativeStrings, nativeReference, nativeReferencePath } from "./genesis-native-format.js"
import { nativeRoot, nativePut, nativeCasDirectory, readNativeFile, decodeNativeUtf8, nativeSha256, nativeImplementation } from "./genesis-native-io.js"
import { createDiskStore } from "./store.js"
import { loadEvaluationAccess, evaluationPolicyUrl } from "./ownership-evaluation-policy.js"
import { evaluationOwnershipClaim } from "./ownership-access.js"
import { validateEvaluationBinding, evaluationBindingUrl } from "./genesis-evaluation-binding.js"
import { ownershipInput } from "./ownership-input.js"

export type EvaluationCandidate = Omit<NativeCandidate, "kind" | "version" | "contract" | "criteria" | "entries"> & {
  kind: "genesis-evaluation-candidate"; version: 2; phase: "evaluation"; plan_path: string; runtime_identity: Record<string, string>
  evaluation: EvaluationOwnershipContract["evaluation"]; original_candidate: Hash; original_contract: Hash
  entries: (NativeCandidate["entries"][number] & { contract: Hash; semanticEvidence: Hash[] })[]
}
export type PreparedEvaluation = { schema: "genesis-native-prepared/v2"; candidate_id: Hash; candidate: EvaluationCandidate }

/** CAS-only. No policy or projection creation, no runtime acceptance. */
export function prepareEvaluation(repoPath: string, planPath: string): PreparedEvaluation {
  const root = nativeRoot(repoPath)
  const readReference = (value: unknown): { text: string; bytes: Uint8Array } => {
    const ref = nativeReference(value), bytes = readNativeFile(root, nativeReferencePath(ref))
    if (nativeSha256(bytes) !== ref.sha256) throw new Error("evaluation-reference-drift")
    return { text: decodeNativeUtf8(bytes), bytes }
  }
  const planBytes = readNativeFile(root, planPath)
  const plan = nativeRecord(JSON.parse(decodeNativeUtf8(planBytes)), "evaluation plan")
  nativeKeys(plan, ["schema", "package_path", "original_prepared", "obligations", "entries", "consumer_ids", "consumer_modes", "read_limits", "maintenance", "implementation", "isolation"], "evaluation plan")
  if (plan.schema !== "genesis-evaluation-plan/v1") throw new Error("evaluation-plan-version")
  const origin = JSON.parse(readReference(plan.original_prepared).text) as PreparedNativePackage
  if (origin.schema !== "genesis-native-prepared/v1" || origin.candidate_id !== id(origin.candidate)) throw new Error("evaluation-original-candidate")
  const isolation = nativeRecord(plan.isolation, "isolation")
  nativeKeys(isolation, ["root", "original_root"], "isolation")
  if (isolation.root !== root || isolation.original_root !== origin.candidate.repo_root || root === origin.candidate.repo_root || root.startsWith(origin.candidate.repo_root + "/") || origin.candidate.repo_root.startsWith(root + "/")) throw new Error("evaluation-isolation-root")
  if (existsSync(join(root, ".atlas/evaluation-store.json"))) loadEvaluationAccess(root).verify()
  else if (existsSync(join(root, ".atlas")) && readdirSync(join(root, ".atlas")).some((name) => name !== "cas")) throw new Error("evaluation-prepare-operational-state")
  const store = createDiskStore(nativeCasDirectory(root))
  const additional: NativeCandidate["observations"] = []
  const observeFile = (path: string, bytes: Uint8Array) => { const key = `file:${path}`, version = id({ kind: "ownership-source", version: 1, bytes: Array.from(bytes) }); additional.push({ key, version }) }
  const capture = (value: unknown) => { const ref = nativeReference(value), read = readReference(value); observeFile(nativeReferencePath(ref), read.bytes); return { text: read.text, body: nativePut(store, { kind: "ownership-body", version: 1, bytes: Array.from(read.bytes) }) } }
  observeFile(planPath, planBytes)
  capture(plan.original_prepared)
  const obligation = capture(plan.obligations)
  const obligations = nativeRecord(JSON.parse(obligation.text), "obligations")
  nativeKeys(obligations, ["schema", "original_candidate", "original_contract", "criteria", "normative_refs", "oracle_refs", "status"], "obligations")
  if (obligations.schema !== "genesis-obligation-set/v1" || obligations.original_candidate !== origin.candidate_id || obligations.original_contract !== origin.candidate.contract || obligations.status !== "PENDING_FINAL_EVIDENCE") throw new Error("evaluation-obligations")
  const criteria = nativeStrings(obligations.criteria, "final criteria")
  if (criteria.length !== origin.candidate.criteria.length || new Set(criteria).size !== criteria.length || !origin.candidate.criteria.every((x) => criteria.includes(x))) throw new Error("evaluation-final-criteria-preserved")
  for (const name of ["normative_refs", "oracle_refs"]) {
    if (!Array.isArray(obligations[name]) || obligations[name].length === 0) throw new Error("evaluation-final-evidence-refs")
    for (const ref of obligations[name]) capture(ref)
  }
  const base = prepareNativePackage(root, nativeText(plan.package_path, "package_path"))
  if (base.candidate.transport.sha256 !== origin.candidate.transport.sha256 || base.candidate.source_revision !== origin.candidate.source_revision) throw new Error("evaluation-package-drift")
  const consumers = nativeStrings(plan.consumer_ids, "consumer ids")
  if (!consumers.length || new Set(consumers).size !== consumers.length) throw new Error("evaluation-finite-consumers")
  const modes = nativeRecord(plan.consumer_modes, "consumer modes")
  if (Object.keys(modes).length !== consumers.length || consumers.some((key) => !["routine", "deep"].includes(String(modes[key])))) throw new Error("evaluation-consumer-modes")
  nativeRecord(plan.read_limits, "read limits")
  nativeRecord(plan.maintenance, "maintenance plan")
  const implementation = nativeRecord(plan.implementation, "implementation")
  if (Object.keys(implementation).length === 0) throw new Error("evaluation-implementation-missing")
  for (const [path, sha] of Object.entries(implementation)) { const bytes = readNativeFile(root, path); if (nativeSha256(bytes) !== sha) throw new Error("evaluation-implementation-drift"); observeFile(path, bytes) }
  const evaluation = { phase: "evaluation" as const, evaluationPlan: nativePut(store, plan), obligationSet: nativePut(store, obligations) }
  if (!Array.isArray(plan.entries) || plan.entries.length !== base.candidate.entries.length) throw new Error("evaluation-entry-coverage")
  const seen = new Set<string>()
  const entries = plan.entries.map((raw) => {
    const e = nativeRecord(raw, "entry")
    nativeKeys(e, ["key", "semantic_refs", "applicability", "limits"], "entry")
    const key = nativeText(e.key, "key"), entry = base.candidate.entries.find((x) => x.key === key)
    if (!entry || seen.has(key)) throw new Error("evaluation-entry-coverage")
    seen.add(key)
    if (!Array.isArray(e.semantic_refs) || e.semantic_refs.length < 2) throw new Error("evaluation-semantic-evidence")
    nativeText(e.applicability, "applicability"); nativeText(e.limits, "limits")
    const semanticEvidence = e.semantic_refs.map((ref) => capture(ref).body)
    const contract: EvaluationOwnershipContract = { kind: "ownership-contract", version: 2, criteria: [...OWNERSHIP_ADMISSION_CRITERIA], evaluation }
    return { ...entry, contract: nativePut(store, contract), semanticEvidence }
  })
  const { contract: _contract, criteria: _criteria, ...baseFields } = base.candidate
  for (const observation of additional) {
    const previous = baseFields.observations.find((x) => x.key === observation.key)
    if (previous !== undefined && previous.version !== observation.version) throw new Error("evaluation-conflicting-observations")
  }
  const observations = [...new Map([...baseFields.observations, ...additional].map((x) => [x.key, x])).values()]
  if (observations.some((x) => ownershipInput(root, x.key) !== x.version)) throw new Error("evaluation-preparation-drift")
  const candidate: EvaluationCandidate = { ...baseFields, observations, kind: "genesis-evaluation-candidate", version: 2, phase: "evaluation", plan_path: planPath,
    evaluation, runtime_identity: evaluationRuntimeIdentity(), original_candidate: origin.candidate_id, original_contract: origin.candidate.contract,
    implementation: { ...base.candidate.implementation, evaluation: nativeImplementation(import.meta.url), evaluationBinding: nativeImplementation(evaluationBindingUrl), evaluationPolicy: nativeImplementation(evaluationPolicyUrl) }, entries }
  return { schema: "genesis-native-prepared/v2", candidate_id: nativePut(store, candidate), candidate }
}

/** Explicit isolated admission only. Ordinary publish rejects this v2 schema. */
export async function admitEvaluation(repoPath: string, value: unknown, approvalPath: string) {
  const record = nativeRecord(value, "evaluation prepared")
  nativeKeys(record, ["schema", "candidate_id", "candidate"], "evaluation prepared")
  if (record.schema !== "genesis-native-prepared/v2") throw new Error("evaluation-prepared-schema")
  const previous = nativeRecord(record.candidate, "candidate")
  const fresh = prepareEvaluation(repoPath, nativeText(previous.plan_path, "plan_path"))
  if (record.candidate_id !== fresh.candidate_id || record.candidate_id !== id(previous) || JSON.stringify(previous) !== JSON.stringify(fresh.candidate)) throw new Error("evaluation-candidate-drift")
  return finishEvaluationAdmission(repoPath, fresh, approvalPath)
}

/** Separate reviewed rebuild lineage, never an exemption from native reprepare. Requires a fresh isolated store. */
export async function admitEvaluationRebuildTarget(repoPath: string, value: unknown, approvalPath: string) {
  const root = nativeRoot(repoPath), store = createDiskStore(nativeCasDirectory(root))
  const record = nativeRecord(value, "target prepared")
  nativeKeys(record, ["schema", "candidate_id", "candidate"], "target prepared")
  if (record.schema !== "genesis-native-prepared/v2") throw new Error("evaluation-target-schema")
  const candidate = nativeRecord(record.candidate, "target candidate")
  if (candidate.kind !== "genesis-evaluation-candidate" || candidate.version !== 2 || candidate.phase !== "evaluation" || candidate.repo_root !== root ||
    record.candidate_id !== id(candidate) || JSON.stringify(store.get(record.candidate_id as Hash)) !== JSON.stringify(candidate) ||
    JSON.stringify(candidate.runtime_identity) !== JSON.stringify(evaluationRuntimeIdentity())) throw new Error("evaluation-target-identity")
  const evaluation = nativeRecord(candidate.evaluation, "target evaluation")
  const plan = nativeRecord(store.get(evaluation.evaluationPlan as Hash), "target plan")
  if (id(plan) !== evaluation.evaluationPlan || plan.schema !== "genesis-evaluation-rebuild-plan/v1") throw new Error("evaluation-target-plan")
  const baseline = nativeRecord(store.get(plan.baseline_candidate as Hash), "baseline candidate")
  const baselineManifest = nativeRecord(store.get(plan.baseline_manifest as Hash), "baseline manifest")
  if (baseline.kind !== "genesis-evaluation-candidate" || baseline.version !== 2 || baseline.phase !== "evaluation" || !isEvaluationOwnershipManifest(baselineManifest) || id(baseline) !== plan.baseline_candidate || id(baselineManifest) !== plan.baseline_manifest || baselineManifest.evaluationCandidate !== plan.baseline_candidate ||
    baseline.original_candidate !== candidate.original_candidate || baseline.original_contract !== candidate.original_contract || baseline.scope !== candidate.scope ||
    nativeRecord(baseline.evaluation, "baseline evaluation").obligationSet !== evaluation.obligationSet || nativeRecord(baseline.evaluation, "baseline evaluation").evaluationPlan !== plan.original_plan ||
    JSON.stringify(candidate.roots) !== JSON.stringify(baseline.roots) || JSON.stringify(candidate.required_artifact_keys) !== JSON.stringify(baseline.required_artifact_keys)) throw new Error("evaluation-target-lineage")
  if (!Array.isArray(candidate.entries) || !Array.isArray(baseline.entries) || candidate.entries.length !== baseline.entries.length) throw new Error("evaluation-target-entry-set")
  for (const raw of candidate.entries) {
    const entry = nativeRecord(raw, "target entry"), prior = baseline.entries.map((x) => nativeRecord(x, "baseline entry")).find((x) => x.key === entry.key)
    if (!prior) throw new Error("evaluation-target-entry-set")
    const artifact = nativeRecord(entry.artifact, "target artifact"), oldArtifact = nativeRecord(prior.artifact, "baseline artifact")
    for (const key of ["key", "scope", "title", "layer", "need", "navigation"]) if (JSON.stringify(artifact[key]) !== JSON.stringify(oldArtifact[key])) throw new Error("evaluation-target-metadata-drift")
  }
  if (!Array.isArray(candidate.observations) || candidate.observations.some((raw) => { const input = nativeRecord(raw, "input"); return typeof input.key !== "string" || ownershipInput(root, input.key) !== input.version })) throw new Error("evaluation-target-source-drift")
  const access = loadEvaluationAccess(root)
  if (access.context.generation !== plan.target_generation) throw new Error("evaluation-target-generation")
  if (store.loadProjection() !== undefined) throw new Error("evaluation-target-needs-fresh-store")
  return finishEvaluationAdmission(root, value as PreparedEvaluation, approvalPath)
}

async function finishEvaluationAdmission(repoPath: string, fresh: PreparedEvaluation, approvalPath: string) {
  const access = loadEvaluationAccess(repoPath)
  access.assert("admit")
  if (access.context.evaluationCandidate !== fresh.candidate_id || JSON.stringify(access.context.evaluation) !== JSON.stringify(fresh.candidate.evaluation) || access.scope !== fresh.candidate.scope) throw new Error("evaluation-policy-candidate")
  const root = fresh.candidate.repo_root, store = createDiskStore(nativeCasDirectory(root))
  const approval = JSON.parse(decodeNativeUtf8(readNativeFile(root, approvalPath)))
  const binding = validateEvaluationBinding(approval, fresh)
  const evidence = binding.decisions.map((decision) => [decision.request_ref, decision.response_ref].map((ref) => {
    const bytes = readNativeFile(root, nativeReferencePath(ref))
    if (nativeSha256(bytes) !== ref.sha256) throw new Error("evaluation-decision-reference-drift")
    return nativePut(store, { kind: "ownership-body", version: 1, bytes: Array.from(bytes) })
  }))
  const entries = fresh.candidate.entries.map((entry) => {
    const reviews = binding.decisions.map((decision, index) => {
      const review: EvaluationOwnershipReview = { kind: "ownership-review", version: 2, evaluation: fresh.candidate.evaluation, evaluationCandidate: fresh.candidate_id,
        reviewer: decision.reviewer, contract: entry.contract, inputs: entry.inputs_id, result: entry.artifact.result,
        criteria: [...OWNERSHIP_ADMISSION_CRITERIA], verdict: "pass", provenance: `New isolated admission only: ${decision.decision_id}; request/response ${evidence[index]!.join(" ")}` }
      return nativePut(store, review)
    })
    const receipt: EvaluationOwnershipReceipt = { kind: "ownership-receipt", version: 2, evaluation: fresh.candidate.evaluation, evaluationCandidate: fresh.candidate_id,
      contract: entry.contract, inputs: entry.inputs, dependencies: entry.dependencies, reviews }
    return { key: entry.key, artifact: nativePut(store, { ...entry.artifact, version: 2, evaluation: fresh.candidate.evaluation, evaluationCandidate: fresh.candidate_id, receipt: nativePut(store, receipt) }) }
  })
  const manifest: EvaluationOwnershipManifest = { kind: "ownership-manifest", version: 2, scope: fresh.candidate.scope, entries, roots: fresh.candidate.roots,
    evaluation: fresh.candidate.evaluation, evaluationCandidate: fresh.candidate_id, generation: access.context.generation }
  const ownership = nativePut(store, manifest)
  for (const entry of entries) {
    const result = readOwnership(store, ownership, { scope: manifest.scope, key: entry.key, maxBytes: Number.MAX_SAFE_INTEGER }, (key) => ownershipInput(root, key), access.context)
    if (result.kind === "hold") return { kind: "hold" as const, phase: "evaluation", refusal: result }
  }
  const { composeRuntime } = await import("./compose.js")
  const { deriveGroundingAxes } = await import("./grounding-computer.js")
  const { walkFileTree } = await import("./fs.js")
  const { readScipOrEmpty } = await import("./scip.js")
  const axes = deriveGroundingAxes(walkFileTree(root), readScipOrEmpty(posix.join(root, ".atlas/index.scip"))).axes
  const node: GroundedFact = { kind: "advisory", id: asNodeKey(String(id({ ownership }))), tier: "T2", scope: manifest.scope,
    claimNorm: evaluationOwnershipClaim(manifest.scope, fresh.candidate_id), predicateSlot: "ownership", ownership,
    grounding: { entries: [{ anchor: { kind: "repo", qualifiedPath: axes.spatial.key, subtreeHash: axes.spatial.subtreeHash }, path: "." }] }, freshness: "FRESH", claims: [], authoring: "ADVISORY" }
  const runtime = composeRuntime(root, access), at = id({ kind: "evaluation-admission", candidate: fresh.candidate_id, generation: access.context.generation })
  const check = runtime.check(node, at)
  if (!check.wouldEmit) return { kind: "hold" as const, phase: "evaluation", check }
  access.assert("admit")
  return { kind: "evaluation-admission-attempt" as const, phase: "evaluation", candidate_id: fresh.candidate_id, ownership, generation: access.context.generation, check, emission: runtime.handler.handle("atlas-emit", { node, at }) }
}
